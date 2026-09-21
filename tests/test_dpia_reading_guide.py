"""Reading aids must never manufacture evidence, approval or changed scores."""

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.database.dpia import assessment_result_payload, save_assessment
from src.services.dpia_reading_guide import reading_guide


def request_data(**overrides):
    return {
        "project_name": "Kommunal AI-mødeassistent",
        "organisation": "Kalundborg Kommune",
        "solution_type": "saas",
        "hosting_region": "eu_eea",
        "personal_data_categories": ["images_audio"],
        "controls": ["retention_deletion"],
        "verified_controls": [],
        "control_evidence": {},
        **overrides,
    }


def result_data(**overrides):
    return {
        "id": "assessment-version-2",
        "version": 2,
        "status": "requires_action",
        "risk_level": "high",
        "template_version": "test-template",
        "blockers": [],
        "missing_information": [],
        "open_questions": [],
        "next_steps": [],
        "recommendations": [],
        "risks": [{"id": "4.1", "residual_risk": "high", "residual_likelihood": 3}],
        "ai_generation": {"model": "test-model", "review": {"checks": []}},
        **overrides,
    }


def approval_data(**overrides):
    return {
        "id": "approval-2",
        "status": "approved",
        "approval_type": "dpia",
        "subject_reference_type": "dpia_assessment",
        "subject_reference_id": "assessment-version-2",
        "decided_by": "Faglig godkender",
        "decided_at": "2026-09-21T09:00:00+00:00",
        "conditions": ["Dokumentér slettetesten."],
        "is_identity_verified": True,
        "decision_snapshot": {},
        **overrides,
    }


def saved_recommendation():
    return {
        "id": "local-model",
        "title": "Afprøv lokal transskription",
        "proposal": "Afprøv en lokal model med syntetiske data.",
        "rationale": "Det kan undersøges, om rå lyd kan holdes i kommunens miljø.",
        "prerequisites": "Afklar drift, licens, kvalitet og dataflow.",
        "verification": "Kontrollér netværkstrafik og sletning under afprøvning.",
        "source_ids": ["input:processing_description"],
    }


def test_reading_aid_does_not_mutate_or_alias_saved_data_and_approval_conditions():
    request = request_data()
    result = result_data(recommendations=[saved_recommendation()])
    approvals = [approval_data()]
    before = deepcopy((request, result, approvals))

    guide = reading_guide(request, result, approvals)
    assert (request, result, approvals) == before
    guide["recommendations"][0]["source_ids"].append("not-a-real-source")
    guide["approval"]["items"][0]["conditions"].append("Changed in the view only")
    assert (request, result, approvals) == before


@pytest.mark.parametrize("status", ["ready_for_review", "requires_action", "blocked", None])
def test_a_blocker_always_prevents_a_ready_conclusion_even_in_inconsistent_history(status):
    guide = reading_guide({}, result_data(status=status, blockers=["Underskrevet aftale mangler."]), [approval_data()])
    assert guide["conclusion"] == "Kan ikke godkendes på det foreliggende grundlag"
    assert guide["blockers"] == ["Underskrevet aftale mangler."]
    # The historic human decision stays visible but never overrides the blocker.
    assert guide["approval"]["status"] == "approved"


def test_blockers_missing_information_and_questions_are_deduplicated_in_priority_order():
    result = result_data(
        blockers=[" Manglende aftale ", "Manglende aftale", "", None],
        missing_information=["Manglende aftale", " Slettefrist ", "Slettefrist"],
        open_questions=["Slettefrist", "Manglende aftale", " Hvem godkender? ", "Hvem godkender?"],
        next_steps=[" Indhent aftalen ", "Indhent aftalen", "", None],
    )
    before = deepcopy(result)
    guide = reading_guide({}, result)
    assert guide["blockers"] == ["Manglende aftale"]
    assert guide["missing_information"] == ["Slettefrist"]
    assert guide["open_questions"] == ["Hvem godkender?"]
    assert guide["next_steps"] == ["Indhent aftalen"]
    assert result == before


def test_verified_controls_require_planning_and_at_least_ten_trimmed_evidence_characters():
    request = request_data(
        controls=["access_control", "logging", "retention_deletion", "testing", "encryption"],
        verified_controls=["access_control", "logging", "retention_deletion", "testing", "encryption", "human_review", "access_control"],
        control_evidence={
            "access_control": "  0123456789  ",
            "logging": "  123456789  ",
            "retention_deletion": "  Dokumenteret slettetest  ",
            "testing": {"note": "Not a text evidence reference"},
            "encryption": None,
            "human_review": "Tilstrækkelig tekst, men ikke planlagt",
        },
    )
    guide = reading_guide(request, result_data())
    assert guide["documented_controls"] == [
        {"title": "Adgang og rettigheder", "evidence": "0123456789"},
        {"title": "Sletning og opbevaringsfrister", "evidence": "Dokumenteret slettetest"},
    ]
    assert guide["approval"]["status"] == "unknown"


def test_planned_controls_and_evidence_alone_are_not_presented_as_verified():
    guide = reading_guide(request_data(control_evidence={"retention_deletion": "En lang evidensreference"}), result_data())
    assert guide["documented_controls"] == []


def test_saved_recommendations_remain_separate_from_results_and_jev_receipt():
    request = request_data()
    result = result_data(recommendations=[saved_recommendation()])
    result["ai_generation"]["review"]["checks"] = [{"id": "recommendation:local-model", "requires_review": False}]
    before = deepcopy(result)
    guide = reading_guide(request, result, [])
    assert guide["recommendation_origin"] == "saved"
    assert guide["recommendations"] == [saved_recommendation()]
    assert "ændrer ikke risikoscorer" in guide["recommendation_note"]
    assert "udgør ikke en godkendelse" in guide["recommendation_note"]
    assert guide["documented_controls"] == []
    assert guide["approval"]["status"] == "not_recorded"
    assert result == before
    assert "ai_generation" not in guide


def test_current_rule_based_suggestions_are_not_inserted_into_old_report_or_jev_receipt():
    request = request_data()
    result = result_data()
    before = deepcopy((request, result))
    guide = reading_guide(request, result, [])
    assert guide["recommendation_origin"] == "rule_based"
    suggestions = {item["id"]: item for item in guide["recommendations"]}
    assert set(suggestions) == {"local-processing", "retention-deletion", "human-review"}
    assert "ikke dokumenteret" in suggestions["local-processing"]["prerequisites"]
    assert "Lokal drift afgør ikke i sig selv lovlighed eller sikkerhed" in suggestions["local-processing"]["prerequisites"]
    assert "rå lyd" in suggestions["retention-deletion"]["proposal"]
    assert "arkivbehov" in suggestions["retention-deletion"]["prerequisites"]
    assert all(item["source_ids"] == [] for item in suggestions.values())
    assert all(item["verification"] and item["prerequisites"] for item in suggestions.values())
    assert (request, result) == before


def test_suggestions_are_contextual_not_an_assumed_capability_of_every_solution():
    guide = reading_guide(request_data(solution_type="ai_system", hosting_region="eu_eea", personal_data_categories=[]), result_data())
    assert guide["recommendations"] == []
    sensitive = reading_guide(request_data(solution_type="ai_system", hosting_region="eu_eea", personal_data_categories=[], cpr_data=True), result_data())
    assert [item["id"] for item in sensitive["recommendations"]] == ["local-processing"]


def test_positive_jev_checks_and_ready_status_never_become_human_approval():
    result = result_data(status="ready_for_review", ai_generation={"review": {"status": "passed", "checks": [{"id": "summary", "requires_review": False, "probability": 1.0}]}})
    without_lookup = reading_guide({}, result)
    with_empty_lookup = reading_guide({}, result, [])
    assert without_lookup["approval"]["status"] == "unknown"
    assert with_empty_lookup["approval"]["status"] == "not_recorded"
    assert with_empty_lookup["approval"]["items"] == []
    assert with_empty_lookup["conclusion"] == "Klar til faglig gennemgang – ikke automatisk godkendt"


@pytest.mark.parametrize("reference_type", ["dpia_assessment", "dpia"])
def test_approval_can_match_the_exact_report_through_a_direct_reference(reference_type):
    approval = approval_data(subject_reference_type=reference_type)
    guide = reading_guide({}, result_data(), [approval])
    assert guide["approval"]["status"] == "approved"
    assert guide["approval"]["label"] == "Godkendelse registreret for denne version"
    assert guide["approval"]["items"][0]["id"] == approval["id"]
    assert guide["approval"]["items"][0]["is_identity_verified"] is True


@pytest.mark.parametrize("reference_type", ["dpia_assessment", "dpia"])
def test_case_decision_can_match_the_exact_report_in_its_snapshot(reference_type):
    approval = approval_data(
        subject_reference_type=None,
        subject_reference_id=None,
        approval_type="case",
        status="approved_with_conditions",
        decision_snapshot={"assessment_references": [{"reference_type": reference_type, "reference_id": "assessment-version-2"}]},
    )
    guide = reading_guide({}, result_data(), [approval])
    assert guide["approval"]["status"] == "approved_with_conditions"
    assert guide["approval"]["label"] == "Godkendt med vilkår – se beslutningen"
    assert guide["approval"]["items"][0]["conditions"] == ["Dokumentér slettetesten."]


def test_approvals_for_other_versions_or_other_reference_types_are_excluded():
    approvals = [
        approval_data(id="previous-version", subject_reference_id="assessment-version-1"),
        approval_data(id="wrong-kind", subject_reference_type="legal_screening"),
        approval_data(id="previous-snapshot", subject_reference_id=None, decision_snapshot={"assessment_references": [{"reference_type": "dpia_assessment", "reference_id": "assessment-version-1"}]}),
        approval_data(id="wrong-snapshot-kind", subject_reference_id=None, decision_snapshot={"assessment_references": [{"reference_type": "legal_screening", "reference_id": "assessment-version-2"}]}),
    ]
    guide = reading_guide({}, result_data(), approvals)
    assert guide["approval"]["status"] == "not_recorded"
    assert guide["approval"]["items"] == []


@pytest.mark.parametrize("report_id", [None, ""])
@pytest.mark.parametrize("via_snapshot", [False, True])
def test_a_missing_report_id_cannot_match_an_unbound_approval(report_id, via_snapshot):
    approval = approval_data(subject_reference_id=report_id)
    if via_snapshot:
        approval["subject_reference_type"] = None
        approval["decision_snapshot"] = {"assessment_references": [{"reference_type": "dpia_assessment", "reference_id": report_id}]}
    guide = reading_guide({}, result_data(id=report_id), [approval])
    assert guide["approval"]["status"] == "not_recorded"
    assert guide["approval"]["items"] == []


def test_latest_version_bound_human_decision_is_displayed_with_older_decisions_preserved():
    approvals = [
        approval_data(id="old-approved", decided_at="2026-09-20T09:00:00+00:00"),
        approval_data(id="latest-rejected", status="rejected", reason="Dokumentationen er utilstrækkelig.", decided_at="2026-09-21T10:00:00+00:00"),
        approval_data(id="newer-other-version", subject_reference_id="assessment-version-3", decided_at="2026-09-21T11:00:00+00:00"),
    ]
    guide = reading_guide({}, result_data(), approvals)
    assert guide["approval"]["status"] == "rejected"
    assert guide["approval"]["label"] == "Afvist ved faglig beslutning"
    assert [item["id"] for item in guide["approval"]["items"]] == ["latest-rejected", "old-approved"]
    assert guide["approval"]["items"][0]["reason"] == "Dokumentationen er utilstrækkelig."


def test_pending_and_unverified_identity_metadata_are_not_hidden():
    guide = reading_guide({}, result_data(), [approval_data(status="pending", decided_at=None, decided_by=None, is_identity_verified=False)])
    assert guide["approval"]["status"] == "pending"
    assert guide["approval"]["label"] == "Afventer menneskelig godkendelse"
    assert guide["approval"]["items"][0]["is_identity_verified"] is False


def test_reading_historical_record_adds_current_guide_without_rewriting_snapshot():
    record = SimpleNamespace(
        result_payload=result_data(reading_guide={"version": "obsolete-presentation"}),
        request_payload=request_data(department="Digitalisering", processing_version="Pilot"),
        project_name="Kommunal AI-mødeassistent", organisation="Kalundborg Kommune",
        version=2, case_db_id="case-1",
    )
    before = deepcopy(vars(record))
    payload = assessment_result_payload(record)
    assert payload["reading_guide"]["version"] != "obsolete-presentation"
    assert payload["reading_guide"]["approval"]["status"] == "unknown"
    assert payload["department"] == "Digitalisering"
    assert payload["processing_version"] == "Pilot"
    assert payload["version"] == 2
    payload["risks"][0]["residual_risk"] = "low"
    assert vars(record) == before


def test_saving_a_new_report_does_not_persist_current_display_guidance():
    result = result_data(reading_guide={"version": "display-only", "recommendations": [{"id": "not-in-the-snapshot"}]})
    before = deepcopy(result)
    session = Mock()
    record = save_assessment(
        session,
        assessment_id=result["id"],
        created_at=datetime(2026, 9, 21, tzinfo=UTC),
        request_payload=request_data(),
        result_payload=result,
    )
    assert "reading_guide" not in record.result_payload
    assert record.result_payload["recommendations"] == []
    assert result == before
    session.add.assert_called_once_with(record)
    session.flush.assert_called_once_with()


def test_known_rights_codes_are_translated_only_in_reading_layer_without_rewriting_other_text():
    known = "Rettighedsprocedurer mangler for: information, access, rectification, erasure, restriction, portability, objection, automated_decision_review."
    unrelated = "Leverandøren beskriver access og erasure i dokumentationen."
    unknown = "Rettighedsprocedurer mangler for: unknown_future_right."
    result = result_data(blockers=[known, unrelated], missing_information=[unknown, "Rettighedsprocedurer mangler for: access."])
    before = deepcopy(result)
    guide = reading_guide({}, result)
    assert guide["blockers"] == [
        "Rettighedsprocedurer mangler for: oplysningspligt, indsigt, berigtigelse, sletning, begrænsning, dataportabilitet, indsigelse, menneskelig prøvelse af automatiske afgørelser.",
        unrelated,
    ]
    assert guide["missing_information"] == [unknown, "Rettighedsprocedurer mangler for: indsigt."]
    assert result == before


@pytest.mark.parametrize("status", ["approved", "approved_with_conditions"])
def test_a_positive_decision_with_unverified_identity_has_a_visible_qualification(status):
    unverified = reading_guide({}, result_data(), [approval_data(status=status, is_identity_verified=False)])
    verified = reading_guide({}, result_data(), [approval_data(status=status, is_identity_verified=True)])
    assert unverified["approval"]["status"] == status
    assert unverified["approval"]["label"] == verified["approval"]["label"] + " – identitet ikke verificeret"
    assert unverified["approval"]["items"][0]["is_identity_verified"] is False
    assert "identitet ikke verificeret" not in verified["approval"]["label"]


def test_local_model_suggestion_mentions_transcription_only_for_audio_image_category():
    for categories in ([], ["identity"], ["case_data"], ["images_audio"]):
        guide = reading_guide(request_data(personal_data_categories=categories), result_data())
        suggestion = next(item for item in guide["recommendations"] if item["id"] == "local-processing")
        assert ("transskription" in suggestion["proposal"]) is ("images_audio" in categories)
        assert "den første bearbejdning" in suggestion["proposal"]
        assert "ikke dokumenteret" in suggestion["prerequisites"]
