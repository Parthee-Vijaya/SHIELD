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
def api(tmp_path, monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
    assert readiness["blockers"] == [
        "Sagen har endnu ingen tilknyttet vurdering."
    ]


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
            .filter(CaseAction.case_db_id == case_id, CaseAction.category == "condition")
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
        files={"file": ("politik.txt", b"Godkendt kommunal kontroltekst.\n", "text/plain")},
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
    assert version["download_href"].endswith(f"/{version_id}/download")

    download_response = client.get(version["download_href"])
    assert download_response.status_code == 200
    assert download_response.content.startswith(b"Godkendt kommunal")
    assert len(download_response.headers["x-content-sha256"]) == 64
