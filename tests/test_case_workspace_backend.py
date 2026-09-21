from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.case_workspace import (
    add_workspace_reference,
    create_case_action,
    decide_case_approval,
    request_case_approval,
    update_case_action,
)
from src.database.cases import attach_assessment, create_case
from src.database.connection import Base
from src.database.document_bank import (
    add_document_version,
    approve_document_version,
    create_document,
    link_document_to_case,
    list_case_documents,
    safe_filename,
)
from src.database.dpia import (
    link_assessment_to_case,
    list_assessments_for_case,
    save_assessment as save_dpia,
)
from src.services.case_workspace_service import (
    build_case_export_bundle,
    build_case_workspace,
)
from src.services.document_bank_storage import (
    delete_document_bytes,
    read_document_bytes,
    store_document_bytes,
)
from src.services.law_change_impact import (
    link_case_to_legal_source,
    list_reassessments,
    register_legal_source_version,
    update_reassessment,
)
from src.rule_engine.audit import save_assessment as save_legal_screening


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    with Session() as db:
        yield db


def _create_case(session, suffix: str = "1"):
    return create_case(
        session,
        case_id=f"K-2026-00{suffix}",
        title=f"Kommunal AI-sag {suffix}",
        assigned_to="Sagsbehandler",
    )


def test_clarification_completion_cannot_bypass_documented_answer(session):
    case = _create_case(session)
    action = create_case_action(
        session,
        case_db_id=case.id,
        title="Afklar aftalegrundlag",
        source_reference_type="procurement_clarification",
    )
    with pytest.raises(ValueError, match="20 tegn"):
        update_case_action(
            session, action.id, status="completed", evidence_note="Kort svar"
        )
    with pytest.raises(ValueError, match="20 tegn"):
        update_case_action(
            session, action.id, status="dismissed", evidence_note="Kort svar"
        )
    update_case_action(
        session,
        action.id,
        status="completed",
        evidence_note="Afklaret med systemejeren og dokumenteret på sagen.",
    )
    with pytest.raises(ValueError, match="20 tegn"):
        update_case_action(session, action.id, evidence_note="")


def _save_dpia(session, assessment_id: str, case_db_id: str | None = None):
    return save_dpia(
        session,
        assessment_id=assessment_id,
        created_at=datetime(2026, 8, 31, 10, 0, tzinfo=UTC),
        request_payload={
            "project_name": "Visitation med AI",
            "organisation": "Kalundborg Kommune",
            "purpose": "Beslutningsstøtte",
        },
        result_payload={
            "status": "ready_for_review",
            "risk_level": "medium",
            "template_version": "hammeren-dpia-1",
            "sections": [],
        },
        case_db_id=case_db_id,
    )


def test_dpia_link_is_nullable_version_pinned_and_cannot_be_reassigned(session):
    first_case = _create_case(session, "1")
    second_case = _create_case(session, "2")
    historic = _save_dpia(session, "dpia-historic")
    assert historic.case_db_id is None

    link_assessment_to_case(session, historic.id, first_case.id)
    assert [item.id for item in list_assessments_for_case(session, first_case.id)] == [
        historic.id
    ]
    with pytest.raises(ValueError, match="another case"):
        link_assessment_to_case(session, historic.id, second_case.id)


def test_human_controls_are_exported_and_audited_without_new_ai_results(session):
    from copy import deepcopy
    from types import SimpleNamespace

    from src.services.technical_controls import create_control, update_control

    case = _create_case(session)
    assessment = _save_dpia(session, "human-control-assessment", case.id)
    original = deepcopy(assessment.result_payload)
    actor = SimpleNamespace(
        oid="reviewer-1", name="Jurist", identity_assurance="verified_entra_token"
    )
    baseline = build_case_workspace(session, case.id)
    control = create_control(
        session,
        case.id,
        {"assessment_id": assessment.id, "question": "Er sletningen dokumenteret?"},
        actor,
    )
    after_create = build_case_workspace(session, case.id)
    updated = update_control(
        session,
        case.id,
        control["id"],
        {
            "expected_version": 1,
            "owner": "IT-sikkerhed",
            "notes": "Afventer dokumentation fra leverandøren.",
            "status": "completed",
        },
        actor,
    )
    workspace = build_case_workspace(session, case.id)
    export = build_case_export_bundle(session, case.id)
    exported = export["human_controls"][0]
    assert exported["version"] == updated["version"] == 2
    assert exported["status"] == "completed"
    assert exported["origin"] == "human"
    assert exported["requires_new_review"] is True
    assert exported["jev_reviewed"] is False
    assert [item["version"] for item in exported["history"]] == [2, 1]
    assert exported["history"][0]["actor_id"] == "reviewer-1"
    assert exported["history"][1]["snapshot"]["owner"] == ""
    assert (
        len(
            {
                baseline["revision_id"],
                after_create["revision_id"],
                export["revision_id"],
            }
        )
        == 3
    )
    assert workspace["revision_id"] == export["revision_id"]
    assert (
        build_case_workspace(session, case.id)["revision_id"] == export["revision_id"]
    )
    events = [
        item
        for item in workspace["timeline"]
        if item["event_type"].startswith("human_control_")
    ]
    assert [item["event_type"] for item in events] == [
        "human_control_updated",
        "human_control_created",
    ]
    assert events[0]["before"]["owner"] == ""
    assert events[0]["after"]["owner"] == "IT-sikkerhed"
    assert events[0]["actor"] == "Jurist"
    assert events[0]["actor_id"] == "reviewer-1"
    assert events[0]["actor_kind"] == "human"
    assert events[0]["model"] is None
    assert events[0]["payload"]["jev_reviewed"] is False
    assert events[1]["before"] == {}
    assert assessment.result_payload == original
    assert len(workspace["assessments"]["dpia"]) == 1
    assert not any(item["event_type"] == "assessment_ai_generated" for item in events)
    other_case = _create_case(session, "2")
    other = build_case_workspace(session, other_case.id)
    assert other["human_controls"] == []
    assert not any(
        item["event_type"].startswith("human_control_") for item in other["timeline"]
    )
    json.dumps(export)


def test_workspace_aggregates_assessments_measures_approvals_and_export(session):
    case = _create_case(session)
    dpia = _save_dpia(session, "dpia-1", case.id)
    screening = save_legal_screening(
        session,
        request_payload={"system_name": "Visitation med AI"},
        response_payload={
            "rule_engine_version": "3.0",
            "aggregate_status": "GO",
            "rules_loaded": 9,
        },
        case_id=case.case_id,
        user_id="user-1",
    )
    add_workspace_reference(
        session,
        case_db_id=case.id,
        reference_type="legal_screening",
        reference_id=screening.id,
        title="Juridisk screening",
        source_version="3.0",
    )
    attach_assessment(session, case.id, screening.id, "GO")
    action = create_case_action(
        session,
        case_db_id=case.id,
        title="Dokumentér sletteprøve",
        category="evidence",
        priority="high",
        owner="Systemejer",
    )
    update_case_action(
        session,
        action.id,
        status="completed",
        evidence_note="Sletteprøve TEST-42 bestået.",
    )
    approval = request_case_approval(
        session,
        case_db_id=case.id,
        requested_by="Sagsbehandler",
        approval_type="dpia",
        subject_reference_type="dpia_assessment",
        subject_reference_id=dpia.id,
        decision_snapshot={
            "dpia_id": dpia.id,
            "template_version": dpia.template_version,
        },
    )
    decide_case_approval(
        session,
        approval.id,
        decision="approved_with_conditions",
        decided_by="DPO",
        actor_oid="11111111-2222-3333-4444-555555555555",
        auth_mode="entra",
        identity_assurance="verified_token",
        reason="Vurderingen kan godkendes med det dokumenterede opfølgningsvilkår.",
        conditions=["Kontrollen gentestes efter seks måneder."],
        is_identity_verified=True,
    )

    workspace = build_case_workspace(session, case.id)
    assert workspace["case"]["id"] == case.id
    assert workspace["assessments"]["dpia"][0]["id"] == dpia.id
    assert workspace["assessments"]["legal_screening"][0]["id"] == screening.id
    assert any(item["status"] == "completed" for item in workspace["measures"])
    assert workspace["approvals"][0]["actor_oid"].startswith("11111111")
    assert workspace["readiness"]["blocking_measure_count"] == 1
    assert workspace["readiness"]["can_request_approval"] is False
    assert any(
        event["event_type"] == "approval_decided" for event in workspace["timeline"]
    )

    export = build_case_export_bundle(session, case.id)
    assert export["export_format"] == "shield-case-bundle-v1"
    assert (
        export["assessments"]["dpia"][0]["request_payload"]["purpose"]
        == "Beslutningsstøtte"
    )
    assert (
        export["assessments"]["legal_screening"][0]["response_payload"][
            "aggregate_status"
        ]
        == "GO"
    )
    json.dumps(export)


def test_law_change_creates_idempotent_case_reassessment_and_can_be_resolved(session):
    case = _create_case(session)
    baseline = register_legal_source_version(
        session,
        source_key="gdpr:article-35",
        title="Databeskyttelsesforordningen artikel 35",
        authority="EUR-Lex",
        source_url="https://eur-lex.europa.eu/eli/reg/2016/679/art_35/oj",
        content_sha256="a" * 64,
        version_identifier="2016/679-original",
    )
    assert baseline.first_seen is True
    assert baseline.changed is False
    dependency = link_case_to_legal_source(
        session,
        case_db_id=case.id,
        source_id=baseline.source.id,
        article_reference="Artikel 35",
        relevance="Bestemmer krav om konsekvensanalyse.",
        assessment_reference_type="dpia_assessment",
        assessment_reference_id="dpia-1",
        linked_by="Jurist",
    )

    change = register_legal_source_version(
        session,
        source_key="gdpr:article-35",
        title="Databeskyttelsesforordningen artikel 35",
        authority="EUR-Lex",
        source_url="https://eur-lex.europa.eu/eli/reg/2016/679/art_35/oj",
        content_sha256="b" * 64,
        version_identifier="konsolideret-2026-08",
        change_summary="Ordlyden er ændret og sagens DPIA skal genvurderes.",
    )
    assert change.changed is True
    assert len(change.reassessments) == 1
    reassessment = change.reassessments[0]
    assert reassessment.case_db_id == case.id
    assert case.next_review_at is not None
    assert (
        build_case_workspace(session, case.id)["readiness"]["open_reassessment_count"]
        == 1
    )

    unchanged = register_legal_source_version(
        session,
        source_key="gdpr:article-35",
        title="Databeskyttelsesforordningen artikel 35",
        authority="EUR-Lex",
        source_url="https://eur-lex.europa.eu/eli/reg/2016/679/art_35/oj",
        content_sha256="b" * 64,
        version_identifier="konsolideret-2026-08",
    )
    assert unchanged.changed is False
    assert len(list_reassessments(session, case_db_id=case.id)) == 1

    update_reassessment(
        session,
        reassessment.id,
        status="completed",
        resolved_by="DPO",
        resolution_note="Ændringen er gennemgået; den eksisterende kontrol er fortsat dækkende.",
    )
    assert reassessment.status == "completed"
    assert dependency.last_reviewed_version_id == change.version.id
    assert (
        build_case_workspace(session, case.id)["readiness"]["open_reassessment_count"]
        == 0
    )


def test_document_bank_preserves_exact_versions_and_safe_binary_metadata(
    session, tmp_path
):
    case = _create_case(session)
    document = create_document(
        session,
        title="Databehandleraftale for leverandør",
        category="data_processing_agreement",
        document_key="DPA-LEVERANDOER-1",
        owner="Indkøb og Jura",
        classification="Intern",
        tags=["GDPR", "leverandør", "GDPR"],
        created_by="Jurist",
    )
    assert safe_filename("../../Aftale endelig.PDF") == "Aftale-endelig.pdf"
    stored = store_document_bytes(
        document_id=document.id,
        version_number=1,
        filename="../../Aftale endelig.PDF",
        content=b"%PDF-1.4\n% Hammeren test\n",
        root=tmp_path,
    )
    assert read_document_bytes(
        stored.storage_key,
        expected_sha256=stored.sha256,
        root=tmp_path,
    ).startswith(b"%PDF")
    with pytest.raises(ValueError, match="already contains other content"):
        store_document_bytes(
            document_id=document.id,
            version_number=1,
            filename="../../Aftale endelig.PDF",
            content=b"%PDF-1.4\n% altered content\n",
            root=tmp_path,
        )
    v1 = add_document_version(
        session,
        document_id=document.id,
        original_filename=stored.original_filename,
        media_type=stored.media_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        status="approved",
        uploaded_by="Jurist",
        approved_by="DPO",
        approval_note="Godkendt som gældende aftale.",
    )
    link_v1 = link_document_to_case(
        session,
        case_db_id=case.id,
        document_id=document.id,
        link_role="basis",
        linked_by="Sagsbehandler",
    )
    assert link_v1.document_version_id == v1.id

    v2 = add_document_version(
        session,
        document_id=document.id,
        original_filename="Aftale-v2.pdf",
        size_bytes=100,
        sha256="c" * 64,
        status="draft",
        uploaded_by="Jurist",
    )
    approve_document_version(
        session,
        v2.id,
        approved_by="DPO",
        approval_note="Ny version er juridisk gennemgået.",
    )
    assert v1.status == "superseded"
    assert v2.supersedes_id == v1.id
    link_v2 = link_document_to_case(
        session,
        case_db_id=case.id,
        document_id=document.id,
        link_role="basis",
    )
    assert link_v2.document_version_id == v2.id
    assert {
        link.document_version_id for link in list_case_documents(session, case.id)
    } == {
        v1.id,
        v2.id,
    }
    workspace_documents = build_case_workspace(session, case.id)["documents"]
    assert all("storage_key" not in item["version"] for item in workspace_documents)
    assert all(
        item["version"]["download_href"].endswith("/download")
        for item in workspace_documents
    )
    assert delete_document_bytes(stored.storage_key, root=tmp_path) is True


def test_document_binary_storage_rejects_extension_content_mismatch(tmp_path):
    with pytest.raises(ValueError, match="not a PDF"):
        store_document_bytes(
            document_id="00000000-0000-4000-8000-000000000001",
            version_number=1,
            filename="not-really.pdf",
            content=b"plain text",
            root=tmp_path,
        )


def test_workspace_versions_exports_and_ai_history_use_only_recorded_provenance(
    session,
):
    from copy import deepcopy

    case = _create_case(session)
    first = _save_dpia(session, "original-snapshot", case.id)
    first_payload = deepcopy(first.result_payload)
    generated_at = datetime(2026, 9, 1, 10, 0, tzinfo=UTC)
    second = save_dpia(
        session,
        assessment_id="ai-snapshot",
        created_at=generated_at,
        case_db_id=case.id,
        request_payload=first.request_payload,
        result_payload={
            **first.result_payload,
            "ai_generation": {
                "model": "gpt-5.6-sol",
                "generated_at": generated_at.isoformat(),
            },
        },
    )
    third = save_dpia(
        session,
        assessment_id="human-snapshot",
        created_at=datetime(2026, 9, 2, 10, 0, tzinfo=UTC),
        case_db_id=case.id,
        request_payload=first.request_payload,
        result_payload={
            **second.result_payload,
            "editorial_revision": {
                "edited_by": "Registreret jurist",
                "actor_id": "recorded-actor",
                "edited_at": "2026-09-02T10:00:00Z",
            },
        },
    )
    workspace = build_case_workspace(session, case.id)
    versions = workspace["assessments"]["dpia"]
    assert [item["id"] for item in versions] == [third.id, second.id, first.id]
    assert [item["is_latest"] for item in versions] == [True, False, False]
    assert [item["generation_kind"] for item in versions] == [
        "human_edited",
        "ai_assisted",
        "rule_based",
    ]
    assert (
        versions[0]["created_by"] == "Registreret jurist"
        and versions[0]["model"] is None
    )
    assert versions[0]["source_ai_model"] == "gpt-5.6-sol"
    assert versions[1]["created_by"] is None and versions[1]["owner"] is None
    assert versions[1]["model"] == "gpt-5.6-sol"
    exports = [
        item for item in workspace["exports"] if item["category"] == "dpia_assessment"
    ]
    assert len(exports) == 6
    for record in (first, second, third):
        formats = [item for item in exports if item["assessment_id"] == record.id]
        assert {item["format"] for item in formats} == {"docx", "xlsx"}
        assert len({item["group_id"] for item in formats}) == 1
        assert all(
            item["version"] == record.version and item["version_label"] in item["title"]
            for item in formats
        )
    ai_events = [
        item
        for item in workspace["timeline"]
        if item["event_type"] == "assessment_ai_generated"
    ]
    assert len(ai_events) == 1
    assert ai_events[0]["model"] == "gpt-5.6-sol" and ai_events[0]["actor_kind"] == "ai"
    assert ai_events[0]["actor"] is None and ai_events[0]["initiated_by"] is None
    human = next(
        item
        for item in workspace["timeline"]
        if item["event_type"] == "assessment_human_edited"
    )
    assert (
        human["actor"] == "Registreret jurist" and human["actor_id"] == "recorded-actor"
    )
    assert first.result_payload == first_payload
    assert (
        workspace["revision_id"]
        == build_case_workspace(session, case.id)["revision_id"]
    )
    assert (
        workspace["revision_id"]
        == build_case_export_bundle(session, case.id)["revision_id"]
    )


def test_historical_action_owner_is_not_a_historical_actor_and_ai_roles_are_explicit(
    session,
):
    case = _create_case(session)
    action = create_case_action(
        session,
        case_db_id=case.id,
        title="Historisk foranstaltning",
        owner="Ansvarlig funktion",
        created_by="Oprindelig opretter",
    )
    action.status = "completed"
    action.completed_at = datetime(2026, 9, 1, tzinfo=UTC)
    session.flush()
    workspace = build_case_workspace(session, case.id)
    completion = next(
        event
        for event in workspace["timeline"]
        if event["event_type"] == "measure_completed"
    )
    assert completion["actor"] is None and completion["actor_kind"] == "unknown"
    update_case_action(
        session,
        action.id,
        owner="Informationssikkerhed",
        updated_by="GPT-6 Astra · rolleforslag på brugerens anmodning",
        actor_kind="ai",
        model="gpt-6-astra",
    )
    updated = build_case_workspace(session, case.id)
    event = next(
        event
        for event in updated["timeline"]
        if event["event_type"] == "measure_updated"
    )
    assert event["actor_kind"] == "ai" and event["model"] == "gpt-6-astra"
    assert event["after"] == {"owner": "Informationssikkerhed"}
    assert action.status == "completed"
    measure = updated["measures"][0]
    assert measure["owner_assignment_kind"] == "ai"
    assert measure["owner_assignment_model"] == "gpt-6-astra"


def test_unverified_legacy_actor_labels_never_invent_human_identity_or_model():
    from src.services.case_workspace_service import _actor_kind

    assert _actor_kind("system") == "system"
    assert _actor_kind("API") == "system"
    assert _actor_kind("Codex") == "ai"
    assert _actor_kind("Juridisk team") == "unknown"
    assert _actor_kind(None) == "unknown"
    assert _actor_kind("Registreret bruger", authenticated=True) == "human"


def test_ai_suggested_assessment_owner_is_explicit_and_does_not_backfill_history(
    session,
):
    from src.database.case_workspace import update_assessment_owner

    case = _create_case(session)
    old = _save_dpia(session, "older-version", case.id)
    new = _save_dpia(session, "latest-version", case.id)
    update_assessment_owner(
        session,
        case_db_id=case.id,
        reference_type="dpia_assessment",
        reference_id=new.id,
        owner="Informationssikkerhed · rolleforslag",
        updated_by="GPT-6 Astra · rolleforslag på brugerens anmodning",
        actor_kind="ai",
        model="gpt-6-astra",
    )
    workspace = build_case_workspace(session, case.id)
    latest, historic = workspace["assessments"]["dpia"]
    assert latest["owner_assignment_kind"] == "ai"
    assert latest["owner_assignment_model"] == "gpt-6-astra"
    assert historic["id"] == old.id and historic["owner"] is None
    event = next(
        item
        for item in workspace["timeline"]
        if item["event_type"] == "assessment_owner_changed"
    )
    assert event["actor_kind"] == "ai" and event["model"] == "gpt-6-astra"
    assert (
        len(
            [
                item
                for item in workspace["timeline"]
                if item["event_type"] == "assessment_created"
            ]
        )
        == 2
    )
