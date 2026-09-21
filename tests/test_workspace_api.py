from __future__ import annotations

import json
from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from src.api.workspace import APPROVER_ACCESS, WORKSPACE_ACCESS, router
from src.auth import UserPrincipal
from src.database.case_workspace import CaseAction, add_workspace_reference
from src.database.cases import attach_assessment, create_case
from src.database.connection import Base, get_db, get_test_engine


@pytest.fixture()
def api(
    tmp_path, monkeypatch
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    monkeypatch.setenv("DOCUMENT_BANK_STORAGE_DIR", str(tmp_path / "documents"))
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    principal = UserPrincipal(
        oid="11111111-2222-3333-4444-555555555555",
        name="Test Godkender",
        username="approver@example.invalid",
        roles=["Hammeren.Sagsbehandler", "Hammeren.Godkender"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    app = FastAPI()
    app.include_router(router)

    def override_db() -> Generator[Session, None, None]:
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[WORKSPACE_ACCESS] = lambda: principal
    app.dependency_overrides[APPROVER_ACCESS] = lambda: principal
    with TestClient(app) as client:
        yield client, testing_session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _ready_case(testing_session: sessionmaker) -> str:
    with testing_session() as db:
        case = create_case(
            db,
            case_id="K-2026-WORKSPACE",
            title="Test af samlet sagsarbejdsrum",
            assigned_to="Test Sagsbehandler",
        )
        add_workspace_reference(
            db,
            case_db_id=case.id,
            reference_type="ai_act_assessment",
            reference_id="ai-act-test-1",
            title="AI Act-screening",
        )
        attach_assessment(db, case.id, "locked-assessment-1", "GO")
        db.commit()
        return case.id


def test_empty_case_starts_at_zero_percent_with_one_clear_blocker(api):
    client, testing_session = api
    with testing_session() as db:
        case = create_case(
            db,
            case_id="K-2026-EMPTY",
            title="Tom sag",
            assigned_to="Test Sagsbehandler",
        )
        db.commit()
        case_id = case.id

    response = client.get(f"/api/v3/cases/{case_id}/workspace")
    assert response.status_code == 200, response.text
    readiness = response.json()["readiness"]
    assert readiness["percent"] == 0
    assert readiness["blockers"] == ["Sagen har endnu ingen tilknyttet vurdering."]


def test_workspace_approval_and_document_flow_is_atomic_and_version_pinned(api):
    client, testing_session = api
    case_id = _ready_case(testing_session)

    request_response = client.post(
        f"/api/v3/cases/{case_id}/approvals",
        json={"approval_type": "case", "note": "Klar til fagligt review."},
    )
    assert request_response.status_code == 201, request_response.text
    approval_id = request_response.json()["id"]

    decision_response = client.post(
        f"/api/v3/cases/{case_id}/approvals/{approval_id}/decision",
        json={
            "decision": "approved_with_conditions",
            "reason": "Sagen kan godkendes, når det beskrevne vilkår er dokumenteret.",
            "conditions": ["Gennemfør og dokumentér den afsluttende adgangstest."],
        },
    )
    assert decision_response.status_code == 200, decision_response.text
    assert decision_response.json()["approval"]["is_identity_verified"] is True
    with testing_session() as db:
        conditions = (
            db.query(CaseAction)
            .filter(
                CaseAction.case_db_id == case_id, CaseAction.category == "condition"
            )
            .all()
        )
        assert len(conditions) == 1

    upload_response = client.post(
        "/api/v3/documents",
        data={
            "metadata": json.dumps(
                {
                    "title": "Kommunal behandlingspolitik",
                    "category": "policy",
                    "owner": "Jura og Informationssikkerhed",
                    "classification": "internal",
                    "tags": ["GDPR", "kontrol"],
                    "valid_from": "2026-08-31T00:00:00Z",
                    "valid_to": "2027-08-31T00:00:00Z",
                    "review_at": "2027-02-28T00:00:00Z",
                }
            )
        },
        files={
            "file": ("politik.txt", b"Godkendt kommunal kontroltekst.\n", "text/plain")
        },
    )
    assert upload_response.status_code == 201, upload_response.text
    document_id = upload_response.json()["document"]["id"]
    version_id = upload_response.json()["version"]["id"]
    uploaded_version = upload_response.json()["version"]
    assert uploaded_version["valid_from"].startswith("2026-08-31")
    assert uploaded_version["valid_to"].startswith("2027-08-31")
    assert uploaded_version["review_at"].startswith("2027-02-28")

    approve_response = client.post(
        f"/api/v3/documents/{document_id}/versions/{version_id}/approve",
        json={"approval_note": "Gennemgået og godkendt som gældende politik."},
    )
    assert approve_response.status_code == 200, approve_response.text
    link_response = client.post(
        f"/api/v3/cases/{case_id}/documents/{document_id}",
        json={
            "document_version_id": version_id,
            "link_role": "evidence",
            "note": "Dokumenterer den organisatoriske kontrol på sagen.",
        },
    )
    assert link_response.status_code == 201, link_response.text

    workspace_response = client.get(f"/api/v3/cases/{case_id}/workspace")
    assert workspace_response.status_code == 200, workspace_response.text
    version = workspace_response.json()["documents"][0]["version"]
    assert "storage_key" not in version
    document = workspace_response.json()["documents"][0]
    assert document["category"] == "policy"
    assert document["uploaded_by"] == "Test Godkender"
    assert document["uploaded_at"] == version["created_at"]
    assert document["uploaded_actor_kind"] == "human"
    assert version["download_href"].endswith(f"/{version_id}/download")

    download_response = client.get(version["download_href"])
    assert download_response.status_code == 200
    assert download_response.content.startswith(b"Godkendt kommunal")
    assert len(download_response.headers["x-content-sha256"]) == 64


def test_action_owner_changes_are_authenticated_audited_and_clearable(api):
    client, testing_session = api
    case_id = _ready_case(testing_session)
    created = client.post(
        f"/api/v3/cases/{case_id}/actions",
        json={"title": "Afklar slettefrist", "owner": "Systemejer"},
    )
    assert created.status_code == 201
    action_id = created.json()["id"]
    url = f"/api/v3/cases/{case_id}/actions/{action_id}"
    changed = client.patch(url, json={"owner": "DPO"})
    assert changed.status_code == 200
    assert changed.json()["owner"] == "DPO"
    assert (
        client.patch(
            url, json={"owner": "DPO", "updated_by": "Opdigtet aktør"}
        ).status_code
        == 422
    )
    assert client.patch(url, json={"owner": "DPO"}).status_code == 200
    assert client.patch(url, json={"owner": None}).json()["owner"] is None
    timeline = client.get(f"/api/v3/cases/{case_id}/workspace").json()["timeline"]
    changes = [item for item in timeline if item["event_type"] == "measure_updated"]
    assert len(changes) == 2  # A repeated value is not a change.
    assert changes[0]["before"] == {"owner": "DPO"}
    assert changes[0]["after"] == {"owner": None}
    assert changes[1]["before"] == {"owner": "Systemejer"}
    assert changes[1]["after"] == {"owner": "DPO"}
    assert all(
        item["actor"] == "Test Godkender" and item["actor_kind"] == "human"
        for item in changes
    )
    assert all(
        item["actor_id"] == "11111111-2222-3333-4444-555555555555" for item in changes
    )
    created_event = next(
        item for item in timeline if item["event_type"] == "measure_added"
    )
    assert created_event["actor"] == "Test Godkender"  # Never the owner.


def test_assessment_owner_is_a_sidecar_and_rejects_another_case(api):
    from copy import deepcopy
    from src.database.dpia import DPIAAssessmentRecord
    from tests.test_case_workspace_backend import _save_dpia

    client, testing_session = api
    case_id = _ready_case(testing_session)
    with testing_session() as db:
        assessment = _save_dpia(db, "owned-assessment", case_id)
        another = create_case(db, case_id="ANOTHER", title="En anden sag")
        _save_dpia(db, "foreign-assessment", another.id)
        snapshot = deepcopy(assessment.result_payload)
        request = deepcopy(assessment.request_payload)
        db.commit()
    root = f"/api/v3/cases/{case_id}"
    before = client.get(f"{root}/workspace").json()
    record = before["assessments"]["dpia"][0]
    assert record["owner"] is None and record["created_by"] is None
    response = client.patch(
        f"{root}/assessments/dpia_assessment/owned-assessment/metadata",
        json={"owner": "Faglig systemejer"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["owner"] == "Faglig systemejer"
    assert (
        client.patch(
            f"{root}/assessments/dpia_assessment/foreign-assessment/metadata",
            json={"owner": "Forkert sag"},
        ).status_code
        == 404
    )
    after = client.get(f"{root}/workspace").json()
    assessment = after["assessments"]["dpia"][0]
    assert assessment["owner"] == "Faglig systemejer"
    assert assessment["created_by"] is None  # Assignment does not invent the creator.
    assert after["revision_id"] != before["revision_id"]
    event = next(
        item
        for item in after["timeline"]
        if item["event_type"] == "assessment_owner_changed"
    )
    assert event["before"] == {"owner": None}
    assert event["after"] == {"owner": "Faglig systemejer"}
    assert event["actor"] == "Test Godkender"
    with testing_session() as db:
        record = db.get(DPIAAssessmentRecord, "owned-assessment")
        assert record.result_payload == snapshot and record.request_payload == request
    bundle = client.get(f"{root}/export.json")
    assert bundle.status_code == 200
    assert bundle.json()["revision_id"] == after["revision_id"]
    assert after["revision_id"] in bundle.headers["content-disposition"]


def test_action_owner_and_audit_event_rollback_together(api, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError
    import src.database.case_workspace as domain

    client, testing_session = api
    case_id = _ready_case(testing_session)
    created = client.post(
        f"/api/v3/cases/{case_id}/actions",
        json={"title": "Afklar adgang", "owner": "Oprindelig ejer"},
    ).json()

    def fail(*args, **kwargs):
        raise SQLAlchemyError("Synthetic unavailable audit storage")

    monkeypatch.setattr(domain, "record_workspace_event", fail)
    response = client.patch(
        f"/api/v3/cases/{case_id}/actions/{created['id']}", json={"owner": "Ny ejer"}
    )
    assert response.status_code == 503
    with testing_session() as db:
        assert db.get(CaseAction, created["id"]).owner == "Oprindelig ejer"


def test_action_due_date_can_be_cleared_without_implicit_changes_on_other_edits(api):
    client, testing_session = api
    case_id = _ready_case(testing_session)
    created = client.post(
        f"/api/v3/cases/{case_id}/actions",
        json={
            "title": "Afklar næste review",
            "owner": "Systemejer",
            "due_at": "2026-12-01T10:00:00Z",
        },
    ).json()
    url = f"/api/v3/cases/{case_id}/actions/{created['id']}"
    changed_owner = client.patch(url, json={"owner": "DPO"})
    assert changed_owner.status_code == 200
    assert changed_owner.json()["due_at"].startswith("2026-12-01T10:00:00")
    cleared = client.patch(url, json={"due_at": None})
    assert cleared.status_code == 200 and cleared.json()["due_at"] is None
    events = client.get(f"/api/v3/cases/{case_id}/workspace").json()["timeline"]
    event = next(
        item
        for item in events
        if item["event_type"] == "measure_updated" and "due_at" in item["after"]
    )
    assert event["before"]["due_at"].startswith("2026-12-01T10:00:00")
    assert event["after"] == {"due_at": None}
