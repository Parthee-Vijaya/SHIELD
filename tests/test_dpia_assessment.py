from __future__ import annotations

from datetime import UTC, datetime
from copy import deepcopy
from types import SimpleNamespace
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from src.config.cors import configured_cors_origins
from src.database.connection import Base, get_test_engine
from src.database.dpia import (
    assessment_result_payload,
    assessment_storage_readiness,
    get_assessment,
    list_assessments,
    save_assessment,
)
import src.services.dpia_export as dpia_export
from src.services.dpia_assessment import (
    DPIAAssessmentRequest,
    RISK_MATRIX,
    assess_dpia,
    risk_matrix,
)
from src.services.dpia_export import (
    OFFICIAL_TEMPLATE_SHA256,
    RISK_ROWS,
    TEMPLATE_PATH,
    TemplateError,
    export_dpia_xlsx,
    template_readiness,
)


def valid_payload(**overrides):
    payload = {
        "project_name": "Hammeren Test",
        "organisation": "Kalundborg Kommune",
        "owner": "Informationssikkerhed",
        "purpose": "At understøtte medarbejdere med kvalitetssikring af sagsarbejde.",
        "processing_description": (
            "Medarbejdere indtaster dokumenter og sagsoplysninger. Leverandøren "
            "behandler input og returnerer et forslag, som gennemgås manuelt."
        ),
        "data_subjects": ["employees", "citizens"],
        "personal_data_categories": ["identity", "case_data"],
        "special_categories": False,
        "criminal_data": False,
        "vulnerable_subjects": True,
        "large_scale": False,
        "systematic_monitoring": False,
        "profiling_scoring": False,
        "data_matching": False,
        "service_access_impact": False,
        "automated_decisions": False,
        "human_oversight": True,
        "solution_type": "ai_system",
        "supplier_name": "Eksempel ApS",
        "hosting_region": "eu_eea",
        "transfer_outside_eea": False,
        "transfer_mechanism": "not_applicable",
        "model_training": False,
        "retention_period": "30 dage, derefter automatisk sletning",
        "legal_basis": "public_task",
        "legal_basis_reference": "Servicelovens § 1, stk. 1",
        "legal_basis_source_url": "https://www.retsinformation.dk/eli/lta/2026/641",
        "dpo_involved": True,
        "controls": [
            "access_control", "encryption", "logging", "data_minimisation",
            "retention_deletion", "vendor_management", "human_review", "testing",
            "incident_response", "training",
        ],
        "verified_controls": [
            "access_control", "encryption", "logging", "data_minimisation",
            "retention_deletion", "vendor_management", "human_review", "testing",
            "incident_response", "training",
        ],
        "control_evidence": {
            "access_control": "IAM-kontrol AC-01 testet 2026-08-20",
            "encryption": "TLS- og lagringskontrol EN-02 testet 2026-08-20",
            "logging": "Logkontrol LG-03 testet 2026-08-20",
            "data_minimisation": "Feltreview DM-04 godkendt 2026-08-20",
            "retention_deletion": "Slettetest RD-05 gennemført 2026-08-20",
            "vendor_management": "DPA og auditbilag VM-06 kontrolleret",
            "human_review": "Reviewprocedure HR-07 stikprøvet 2026-08-20",
            "testing": "Kvalitets- og biastest TS-08 gennemført",
            "incident_response": "Beredskabsøvelse IR-09 gennemført",
            "training": "Uddannelseslog TR-10 verificeret",
        },
        "article_9_basis": "not_applicable",
        "criminal_data_basis": "not_applicable",
        "criminal_data_legal_reference": "",
        "cpr_data": False,
        "cpr_basis": "not_applicable",
        "cpr_legal_reference": "",
        "rights_procedures": [
            "information", "access", "rectification", "erasure", "restriction", "objection",
        ],
        "rights_procedure_description": (
            "Registrerede kontakter DPO-portalen; sager journaliseres, fordeles til systemejer "
            "og besvares inden den dokumenterede GDPR-frist."
        ),
    }
    payload.update(overrides)
    return payload


def make_assessment(**overrides):
    request = DPIAAssessmentRequest.model_validate(valid_payload(**overrides))
    result = assess_dpia(
        request,
        assessment_id="00000000-0000-4000-8000-000000000001",
        created_at=datetime(2026, 8, 30, 12, 0, tzinfo=UTC),
    )
    return request, result


def test_velatir_example_is_contract_valid_and_conservatively_unverified():
    fixture_path = Path(__file__).resolve().parents[1] / "examples" / "dpia" / "velatir.json"
    request = DPIAAssessmentRequest.model_validate(json.loads(fixture_path.read_text()))
    result = assess_dpia(
        request,
        assessment_id="velatir-smoke",
        created_at=datetime(2026, 8, 30, 12, 0, tzinfo=UTC),
    )
    assert request.verified_controls == []
    assert result.status == "requires_action"
    assert result.completeness < 100
    assert all(risk.residual_likelihood == risk.likelihood for risk in result.risks)
    assert all(risk.residual_impact == risk.impact for risk in result.risks)


@pytest.mark.parametrize(
    "change",
    [
        {"project_name": " "},
        {"purpose": "for kort"},
        {"processing_description": "for kort"},
        {"data_subjects": []},
        {"personal_data_categories": []},
        {"supplier_name": ""},
        {"transfer_outside_eea": True, "transfer_mechanism": "not_applicable"},
        {"unexpected_field": "must be rejected"},
    ],
)
def test_request_rejects_missing_or_ambiguous_core_data(change):
    with pytest.raises(ValidationError):
        DPIAAssessmentRequest.model_validate(valid_payload(**change))


def test_assessment_populates_all_standard_sections_and_risks():
    _, result = make_assessment(vulnerable_subjects=False)
    assert [section.id for section in result.sections] == [
        *(f"1.{number}" for number in range(1, 10)),
        *(f"2.{number}" for number in range(1, 31)),
    ]
    assert [risk.id for risk in result.risks] == [
        *(f"3.{number}" for number in range(1, 9)),
        *(f"4.{number}" for number in range(1, 9)),
        *(f"5.{number}" for number in range(1, 8)),
        *(f"6.{number}" for number in range(1, 11)),
    ]
    assert len(result.sections) == 39
    assert len(result.risks) == 33
    assert result.status == "ready_for_review"
    assert len(result.screening_criteria) == 9
    assert sum(item.matched for item in result.screening_criteria) == 1
    assert result.dpia_required is False
    assert all(risk.implementation_status == "requires_verification" for risk in result.risks)


def test_dpia_screening_explains_each_matched_european_criterion():
    _, result = make_assessment(
        vulnerable_subjects=False,
        profiling_scoring=True,
        data_matching=True,
        service_access_impact=True,
    )
    matched = {item.id for item in result.screening_criteria if item.matched}
    assert matched == {
        "evaluation_scoring",
        "data_matching",
        "innovative_technology",
        "rights_or_service_access",
    }
    assert result.dpia_required is True
    assert "4 af 9" in result.screening_conclusion


def test_high_residual_risk_requires_action_without_claiming_approval():
    _, result = make_assessment(vulnerable_subjects=True)
    assert result.risk_level in {"high", "very_high"}
    assert result.status == "requires_action"
    assert "godkend" not in result.status_label.lower()


def test_assessment_fails_closed_on_unresolved_lawfulness():
    _, result = make_assessment(
        legal_basis="not_assessed",
        hosting_region="unknown",
        automated_decisions=True,
        human_oversight=False,
        dpo_involved=False,
    )
    assert result.status == "blocked"
    assert result.dpia_required is True
    assert len(result.blockers) >= 4
    assert result.completeness < 100
    assert "godkend" not in result.status_label.lower()
    assert any("Behandlingsgrundlag" in blocker for blocker in result.blockers)


def test_public_task_without_specific_sector_reference_is_blocked():
    _, result = make_assessment(legal_basis_reference="")
    assert result.status == "blocked"
    assert any("sektorhjemmel" in blocker for blocker in result.blockers)


@pytest.mark.parametrize("procedures", [[], ["portability", "objection"]])
def test_unknown_legal_basis_keeps_both_conditional_rights_unresolved(procedures):
    _, result = make_assessment(
        legal_basis="not_assessed",
        rights_procedures=procedures,
    )
    for section_id in ("2.26", "2.27"):
        section = next(item for item in result.sections if item.id == section_id)
        assert section.source == "missing_information"
        assert section.review_status == "missing_information"
        assert "behandlingsgrundlaget er ikke afklaret" in section.text
        assert "ikke relevant" not in section.text
        assert any(f"Afsnit {section_id} " in item for item in result.missing_information)


@pytest.mark.parametrize(
    ("mechanism", "label"),
    [
        ("not_assessed", "Ikke afklaret endnu"),
        ("scc", "EU-standardkontraktbestemmelser (SCC)"),
        ("adequacy_decision", "Tilstrækkelighedsafgørelse"),
        ("bcr", "Bindende virksomhedsregler (BCR)"),
        ("derogation", "Undtagelse efter GDPR artikel 49"),
    ],
)
def test_transfer_basis_is_readable_in_every_affected_section(mechanism, label):
    _, result = make_assessment(
        transfer_outside_eea=True,
        transfer_mechanism=mechanism,
    )
    for section_id in ("1.4", "1.7", "2.30"):
        section = next(item for item in result.sections if item.id == section_id)
        assert f"Oplyst overførselsgrundlag: {label}." in section.text
        assert "not_assessed" not in section.text
    if mechanism == "not_assessed":
        assert result.status == "blocked"
        assert any("Overførselsgrundlag" in item for item in result.blockers)


def test_claimed_controls_without_evidence_never_reduce_residual_risk():
    _, result = make_assessment(verified_controls=[], control_evidence={})
    assert result.status == "requires_action"
    assert result.completeness < 100
    assert result.missing_information
    assert all(risk.residual_likelihood == risk.likelihood for risk in result.risks)
    assert all(risk.residual_impact == risk.impact for risk in result.risks)
    assert any("ikke verificeret" in risk.measures for risk in result.risks)


def test_only_evidenced_verified_controls_can_reduce_risk():
    _, verified = make_assessment()
    _, claimed = make_assessment(verified_controls=[], control_evidence={})
    assert any(
        (left.residual_likelihood, left.residual_impact)
        < (right.residual_likelihood, right.residual_impact)
        for left, right in zip(verified.risks, claimed.risks)
    )
    invalid = valid_payload(
        verified_controls=["encryption"],
        control_evidence={"encryption": "kort"},
    )
    with pytest.raises(ValidationError):
        DPIAAssessmentRequest.model_validate(invalid)


@pytest.mark.parametrize("training", [False, None])
def test_supplier_development_risks_are_not_dismissed_without_customer_training(training):
    _, result = make_assessment(
        model_training=training, vulnerable_subjects=False,
        verified_controls=[], control_evidence={},
    )
    expected_scores = {"4.1": (2, 3), "4.2": (2, 4), "4.3": (2, 2), "4.4": (2, 3), "4.6": (2, 3)}
    for risk in result.risks:
        if risk.id in expected_scores:
            assert (risk.likelihood, risk.impact) == expected_scores[risk.id]
            assert (risk.residual_likelihood, risk.residual_impact) == expected_scores[risk.id]
            assert risk.inherent_risk != "low"
            assert "Ikke relevant" not in risk.measures
            assert "leverandørmodellens udviklingsgrundlag" in risk.measures


def test_unknown_training_stays_unknown_and_blocks_readiness_until_documented():
    request, result = make_assessment(model_training=None, vulnerable_subjects=False)
    assert request.model_training is None
    assert request.model_dump(mode="json")["model_training"] is None
    section = next(item for item in result.sections if item.id == "2.11")
    assert section.review_status == "missing_information"
    assert "ikke afklaret" in section.text
    assert result.status == "blocked"
    assert any("modeltræning er ikke afklaret" in item for item in result.blockers)
    assert any("modeltræning er ikke afklaret" in item for item in result.missing_information)
    assert result.completeness < 100


@pytest.mark.parametrize("training", [False, True])
def test_existing_boolean_training_answers_remain_valid_and_require_review(training):
    request, result = make_assessment(model_training=training)
    assert request.model_training is training
    section = next(item for item in result.sections if item.id == "2.11")
    assert section.review_status == "requires_review"
    assert not any("modeltræning er ikke afklaret" in item for item in result.blockers)
    if training:
        assert next(item for item in result.risks if item.id == "4.4").likelihood == 3


def test_unknown_training_is_not_false_in_non_ai_screening_explanation():
    _, result = make_assessment(model_training=None, solution_type="saas")
    criterion = next(item for item in result.screening_criteria if item.id == "innovative_technology")
    assert criterion.matched is False
    assert "ikke afklaret" in criterion.explanation


def test_documented_sensitive_criminal_and_cpr_bases_resolve_lawfulness_sections():
    _, result = make_assessment(
        special_categories=True,
        article_9_basis="substantial_public_interest",
        criminal_data=True,
        criminal_data_basis="public_authority_necessary",
        criminal_data_legal_reference="Databeskyttelseslovens § 8, stk. 1",
        cpr_data=True,
        cpr_basis="statutory_authority",
        cpr_legal_reference="Relevant sektorlovs § 12",
    )
    sections = {section.id: section for section in result.sections}
    assert sections["2.2"].review_status != "missing_information"
    assert sections["2.3"].review_status != "missing_information"
    assert sections["2.4"].review_status != "missing_information"
    assert not any("artikel 9" in blocker.lower() for blocker in result.blockers)
    assert not any("§ 8" in blocker for blocker in result.blockers)


@pytest.mark.parametrize(
    "change",
    [
        {"hosting_region": "third_country", "transfer_outside_eea": False},
        {"data_subjects": ["children"], "vulnerable_subjects": False},
        {"special_categories": True, "article_9_basis": "not_applicable"},
        {"criminal_data": True, "criminal_data_basis": "not_applicable"},
        {"cpr_data": True, "cpr_basis": "not_applicable"},
        {"verified_controls": ["encryption"], "control_evidence": {}},
    ],
)
def test_cross_field_inconsistencies_are_rejected(change):
    with pytest.raises(ValidationError):
        DPIAAssessmentRequest.model_validate(valid_payload(**change))


def test_risk_matrix_matches_all_16_template_cells():
    expected = {
        (1, 1): "low", (2, 1): "low", (3, 1): "medium", (4, 1): "high",
        (1, 2): "low", (2, 2): "medium", (3, 2): "high", (4, 2): "high",
        (1, 3): "medium", (2, 3): "high", (3, 3): "high", (4, 3): "very_high",
        (1, 4): "high", (2, 4): "very_high", (3, 4): "very_high", (4, 4): "very_high",
    }
    assert RISK_MATRIX == expected
    for coordinates, level in expected.items():
        assert risk_matrix(*coordinates) == level
    with pytest.raises(ValueError):
        risk_matrix(0, 4)


def test_persistence_round_trip_uses_complete_snapshots():
    request, result = make_assessment()
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)
    with TestSession() as db:
        save_assessment(
            db,
            assessment_id=result.id,
            created_at=result.created_at,
            request_payload=request.model_dump(mode="json"),
            result_payload=result.model_dump(mode="json"),
        )
        db.commit()
        stored = get_assessment(db, result.id)
        assert stored is not None
        assert stored.request_payload["project_name"] == "Hammeren Test"
        assert stored.result_payload["risks"][0]["id"] == "3.1"
        records, count = list_assessments(db)
        assert count == 1
        assert records[0].id == result.id


def test_historical_identity_comes_from_saved_record_without_changing_snapshot():
    request, result = make_assessment(processing_version="Pilot 2026")
    legacy = result.model_dump(mode="json")
    for key in ("project_name", "organisation", "department", "processing_version"):
        legacy.pop(key, None)
    # Earlier versions assigned low risk from model_training=False. Reading a
    # snapshot must not quietly recalculate it using the corrected rules.
    old_training_risk = next(item for item in legacy["risks"] if item["id"] == "4.1")
    old_training_risk.update(likelihood=1, impact=1, inherent_risk="low", residual_likelihood=1, residual_impact=1, residual_risk="low")
    original = deepcopy(legacy)
    record = SimpleNamespace(
        result_payload=legacy,
        request_payload=request.model_dump(mode="json"),
        project_name=request.project_name,
        organisation=request.organisation,
        version=3,
        case_db_id="historical-case",
    )
    projected = assessment_result_payload(record)
    assert projected["project_name"] == "Hammeren Test"
    assert projected["processing_version"] == "Pilot 2026"
    assert projected["department"] == ""
    assert projected["version"] == 3
    assert next(item for item in projected["risks"] if item["id"] == "4.1") == old_training_risk
    assert legacy == original
    projected["risks"][0]["scenario"] = "Client-only edit"
    assert legacy == original


def test_department_and_planning_fields_are_kept_in_report_and_downloads():
    from src.services.dpia_docx import export_dpia_docx

    request, result = make_assessment(
        department="Børn og Familie",
        processing_version="Pilot",
        planned_start_date="2026-10-01",
        planned_end_date="2026-12-31",
        planned_start_note="Efter afsluttet uddannelse",
        planned_end_condition="Ophør hvis formålet bortfalder",
    )
    assert result.project_name == request.project_name
    assert result.department == request.department
    assert result.processing_version == "Pilot"
    for content in (request.department, request.planned_end_condition, request.planned_start_date):
        assert content in " ".join(section.text for section in result.sections)
    for blob in (export_dpia_xlsx(request, result), export_dpia_docx(request, result)):
        with ZipFile(BytesIO(blob)) as archive:
            text_content = " ".join(archive.read(name).decode() for name in archive.namelist() if name.endswith('.xml'))
        assert request.department in text_content
        assert request.planned_end_condition in text_content
        assert request.planned_start_date in text_content


def test_legacy_free_text_dates_remain_readable_without_guessing_calendar_dates():
    request = DPIAAssessmentRequest.model_validate(valid_payload(
        planned_start_date="Efter faglig godkendelse",
        planned_end_date="Pilot slutter efter fire måneder",
    ))
    assert request.planned_start_date == "Efter faglig godkendelse"
    assert request.planned_end_date == "Pilot slutter efter fire måneder"
    assert request.planned_start_note == request.planned_end_condition == ""


def test_storage_readiness_checks_table_and_required_columns(tmp_path: Path):
    complete_engine = create_engine(f"sqlite:///{tmp_path / 'complete.db'}")
    Base.metadata.create_all(complete_engine)
    assert assessment_storage_readiness(complete_engine) == (True, "ok")

    incomplete_engine = create_engine(f"sqlite:///{tmp_path / 'incomplete.db'}")
    with incomplete_engine.begin() as connection:
        connection.execute(text("CREATE TABLE dpia_assessments (id VARCHAR(36) PRIMARY KEY)"))
    ready, detail = assessment_storage_readiness(incomplete_engine)
    assert ready is False
    assert "mangler kolonner" in detail


def _cell_fragment(xml: bytes, reference: str) -> bytes:
    match = re.search(
        rb'<c\b(?=[^>]*\br="' + re.escape(reference.encode()) + rb'")[^>]*>.*?</c>',
        xml,
        flags=re.DOTALL,
    )
    assert match, f"cell {reference} missing"
    return match.group(0)


def _xml_feature(xml: bytes, local_name: str) -> bytes | None:
    match = re.search(
        rb'<(?:[A-Za-z0-9_]+:)?' + local_name.encode() + rb'\b.*?</(?:[A-Za-z0-9_]+:)?' + local_name.encode() + rb'>',
        xml,
        flags=re.DOTALL,
    )
    return match.group(0) if match else None


def test_export_patches_literal_values_and_preserves_template_features():
    request, result = make_assessment(owner="=2+2")
    exported = export_dpia_xlsx(request, result)
    assert len(exported) > 100_000

    with ZipFile(TEMPLATE_PATH, "r") as original, ZipFile(BytesIO(exported), "r") as generated:
        assert generated.namelist() == original.namelist() + [
            "xl/worksheets/ai-provenance.xml"
        ]
        assert generated.testzip() is None
        # Workbook extensions and all original style definitions are preserved;
        # wrapped variants may be appended for populated input cells.
        for name in ("xl/theme/theme1.xml",):
            assert original.read(name) == generated.read(name)
        original_types = ET.fromstring(original.read("[Content_Types].xml"))
        generated_types = ET.fromstring(generated.read("[Content_Types].xml"))
        assert [ET.tostring(x) for x in original_types] == [
            ET.tostring(x) for x in list(generated_types)[:-1]
        ]
        assert generated_types[-1].attrib["PartName"] == "/xl/worksheets/ai-provenance.xml"
        styles_before = ET.fromstring(original.read("xl/styles.xml"))
        styles_after = ET.fromstring(generated.read("xl/styles.xml"))
        for before, after in zip(styles_before, styles_after):
            if before.tag.endswith("}cellXfs"):
                assert len(after) >= len(before)
                assert [ET.tostring(x) for x in before] == [ET.tostring(x) for x in list(after)[:len(before)]]
            else:
                assert ET.tostring(before) == ET.tostring(after)

        original_risk = original.read("xl/worksheets/sheet6.xml")
        generated_risk = generated.read("xl/worksheets/sheet6.xml")
        for risk_id, row in RISK_ROWS.items():
            result_risk = next(item for item in result.risks if item.id == risk_id)
            for column, expected in (
                ("I", {"low": "Lav", "medium": "Mellem", "high": "Høj", "very_high": "Meget høj"}[result_risk.inherent_risk]),
                ("M", {"low": "Lav", "medium": "Mellem", "high": "Høj", "very_high": "Meget høj"}[result_risk.residual_risk]),
            ):
                original_cell = _cell_fragment(original_risk, f"{column}{row}")
                generated_cell = _cell_fragment(generated_risk, f"{column}{row}")
                assert re.search(rb"<f>.*?</f>", original_cell, re.DOTALL).group() == re.search(rb"<f>.*?</f>", generated_cell, re.DOTALL).group(), risk_id
                assert re.search(rb'\bs="[^"]+"', original_cell).group() == re.search(rb'\bs="[^"]+"', generated_cell).group(), risk_id
                assert f"<v>{expected}</v>".encode() in generated_cell

        # The sheet's validation/conditional-formatting extension payloads are
        # preserved exactly because no library round-trip rewrites the XML.
        for feature in (b"conditionalFormatting", b"dataValidations", b"extLst"):
            local_name = feature.decode()
            assert _xml_feature(original_risk, local_name) == _xml_feature(generated_risk, local_name)

        workbook = ET.fromstring(generated.read("xl/workbook.xml"))
        namespace = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        calculation = workbook.find("m:calcPr", namespace)
        assert calculation is not None
        assert calculation.attrib["calcMode"] == "auto"
        assert calculation.attrib["fullCalcOnLoad"] == "1"
        assert calculation.attrib["forceFullCalc"] == "1"

        owner_cell = _cell_fragment(generated_risk, "N3")
        assert b't="inlineStr"' in owner_cell
        assert b"=2+2" in owner_cell
        assert b"<f" not in owner_cell
        # Style id remains present when the payload type/value is replaced.
        assert re.search(rb'\bs="[^"]+"', owner_cell)


def test_template_readiness_and_cors_are_fail_closed(tmp_path: Path):
    assert template_readiness()[0] is True
    assert sha256(TEMPLATE_PATH.read_bytes()).hexdigest() == OFFICIAL_TEMPLATE_SHA256
    assert template_readiness(tmp_path / "missing.xlsx")[0] is False
    assert configured_cors_origins("http://localhost, https://app.example/") == [
        "http://localhost", "https://app.example"
    ]
    with pytest.raises(ValueError):
        configured_cors_origins("*")
    with pytest.raises(ValueError):
        configured_cors_origins(" , ")


def _tamper_template(
    destination: Path,
    *,
    member: str,
    old: bytes,
    new: bytes,
) -> None:
    with ZipFile(TEMPLATE_PATH, "r") as source, ZipFile(destination, "w") as target:
        replaced = False
        for entry in source.infolist():
            payload = source.read(entry.filename)
            if entry.filename == member:
                assert old in payload
                payload = payload.replace(old, new, 1)
                replaced = True
            target.writestr(entry, payload)
    assert replaced


def _accept_tampered_hash_for_structural_test(
    monkeypatch: pytest.MonkeyPatch,
    template_path: Path,
) -> None:
    checksum = sha256(template_path.read_bytes()).hexdigest()
    monkeypatch.setattr(dpia_export, "OFFICIAL_TEMPLATE_SHA256", checksum)
    monkeypatch.setattr(
        dpia_export,
        "TEMPLATE_VERSION",
        f"structural-test-sha256-{checksum[:12]}",
    )


def test_template_readiness_rejects_changed_risk_formula(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    changed = tmp_path / "changed-formula.xlsx"
    original_formula = (
        b"<f>INDEX(Evalueringskriterier!$R$5:$U$8,"
        b"MATCH(H3,Evalueringskriterier!$Q$5:$Q$8,0),"
        b"MATCH(F3,Evalueringskriterier!$R$9:$U$9,0))</f>"
    )
    _tamper_template(
        changed,
        member="xl/worksheets/sheet6.xml",
        old=original_formula,
        new=b"<f>1/0</f>",
    )

    ready, detail = template_readiness(changed)
    assert ready is False
    assert "SHA256" in detail

    # Bypass only the checksum gate to prove that the structural validation is
    # independently fail-closed as well.
    _accept_tampered_hash_for_structural_test(monkeypatch, changed)
    ready, detail = template_readiness(changed)
    assert ready is False
    assert "formel" in detail
    assert "I3" in detail


def test_template_readiness_requires_evaluation_sheet(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    changed = tmp_path / "missing-evaluation-sheet.xlsx"
    _tamper_template(
        changed,
        member="xl/workbook.xml",
        old=b'name="Evalueringskriterier"',
        new=b'name="Evalueringskriterier-aendret"',
    )
    _accept_tampered_hash_for_structural_test(monkeypatch, changed)

    ready, detail = template_readiness(changed)
    assert ready is False
    assert "Evalueringskriterier" in detail
    assert "mangler ark" in detail


def test_export_removes_every_xml_10_invalid_character():
    request, result = make_assessment(owner="=2+2<&\x00\ufffe\uffff")
    exported = export_dpia_xlsx(request, result)

    with ZipFile(BytesIO(exported), "r") as generated:
        risk_xml = generated.read("xl/worksheets/sheet6.xml")
        # Parsing the generated XML is the important regression check: these
        # noncharacters previously produced a CRC-valid but unreadable XLSX.
        ET.fromstring(risk_xml)
        owner_cell = _cell_fragment(risk_xml, "N3")
        assert b"=2+2&lt;&amp;" in owner_cell
        assert b"\x00" not in owner_cell
        assert "\ufffe".encode() not in owner_cell
        assert "\uffff".encode() not in owner_cell


def test_export_rejects_old_snapshot_template_version():
    request, result = make_assessment()
    old_snapshot = result.model_copy(
        update={"template_version": "datatilsynet-ai-2023-sha256-deadbeef0000"}
    )

    with pytest.raises(TemplateError, match="oprindelige version"):
        export_dpia_xlsx(request, old_snapshot)


def test_export_rejects_incompatible_snapshot_contract():
    request, result = make_assessment()
    incompatible = result.model_copy(update={"risks": result.risks[:-1]})

    with pytest.raises(TemplateError, match="inkompatibel risikokontrakt"):
        export_dpia_xlsx(request, incompatible)


def test_export_rejects_risk_level_that_disagrees_with_matrix():
    request, result = make_assessment()
    first_risk = result.risks[0]
    wrong_level = "low" if first_risk.inherent_risk != "low" else "very_high"
    inconsistent_risk = first_risk.model_copy(update={"inherent_risk": wrong_level})
    inconsistent = result.model_copy(
        update={"risks": [inconsistent_risk, *result.risks[1:]]}
    )

    with pytest.raises(TemplateError, match="inkonsistent risikomatrix"):
        export_dpia_xlsx(request, inconsistent)
