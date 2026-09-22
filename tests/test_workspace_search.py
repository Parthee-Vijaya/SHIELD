from datetime import UTC, datetime
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from src.auth import UserPrincipal, get_current_user
from src.database.case_workspace import CaseWorkspaceReference
from src.database.cases import create_case
from src.database.connection import Base, get_db, get_test_engine
from src.database.document_bank import MunicipalDocument
from src.database.dpia import DPIAAssessmentRecord
from src.services.workspace_search import (
    build_workspace_search,
    fuzzy_score,
    normalize_search,
)


@pytest.fixture
def db():
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def case_and_assessment(db):
    case = create_case(
        db,
        case_id="K-2026-0042",
        title="Krisp · Kalundborg",
        assigned_to="Jura",
        notes="PRIVATE-SOURCE",
    )
    now = datetime.now(UTC)
    for version in (1, 2):
        db.add(
            DPIAAssessmentRecord(
                id=f"assessment-{version}",
                case_db_id=case.id,
                version=version,
                project_name="Krisp",
                organisation="Kalundborg Kommune",
                status="requires_action",
                risk_level="high",
                template_version="test",
                created_at=now,
                updated_at=now,
                request_payload={"private": "PRIVATE-SOURCE"},
                result_payload={"private": "PRIVATE-SOURCE"},
            )
        )
    db.add(
        CaseWorkspaceReference(
            id="reference-1",
            case_db_id=case.id,
            reference_type="ai_act_assessment",
            reference_id="ai-act-1",
            title="Krisp AI Act",
            summary="PRIVATE-SOURCE",
            details={"private": "PRIVATE-SOURCE"},
        )
    )
    db.add(
        MunicipalDocument(
            id="document-1",
            title="Krisp DBA",
            category="data_processing_agreement",
            description="PRIVATE-SOURCE",
            owner="Jura",
        )
    )
    db.flush()
    return case


def test_danish_typo_search_ranks_exact_matches_and_rejects_unrelated_words():
    assert (
        normalize_search("Følsomme målinger Ændringer")
        == "folsomme maalinger aendringer"
    )
    assert fuzzy_score("Krisp", "Krisp") > fuzzy_score("Krips", "Krisp") > 0
    assert fuzzy_score("konsekvensanlyse", "Konsekvensanalyse og risici") > 0
    assert fuzzy_score("folsomme", "Følsomme oplysninger") > 0
    assert fuzzy_score("bager", "Databehandleraftale") == 0


def test_results_are_categorized_versioned_metadata_with_real_links(db):
    case = case_and_assessment(db)
    payload = build_workspace_search(db, "Krips")
    groups = {
        kind: [row for row in payload["results"] if row["type"] == kind]
        for kind in payload["sections"]
    }
    assert groups["cases"][0]["action"]["route"] == f"/sager/{case.id}"
    assert (
        len(groups["assessments"]) == 2
    )  # latest DPIA + AI Act, not every old version
    dpia = next(
        item for item in groups["assessments"] if item["id"].startswith("dpia-")
    )
    assert dpia["id"] == "dpia-assessment-2"
    assert dpia["summary"] == "Version 2 · Kalundborg Kommune"
    assert (
        dpia["action"]["route"]
        == f"/vurdering?assessment_id=assessment-2&case={case.id}"
    )
    assert (
        groups["documents"][0]["action"]["route"]
        == "/dokumentbank?document_id=document-1"
    )
    assert "PRIVATE-SOURCE" not in json.dumps(payload)
    assert build_workspace_search(db, "PRIVATE-SOURCE")["results"] == []


def test_internal_fixtures_are_hidden_and_limits_report_full_totals(db):
    for index in range(5):
        create_case(db, case_id=f"K-{index}", title=f"Krisp kommunal sag {index}")
    create_case(db, case_id="hidden", title="E2E-test Krisp")
    db.flush()
    payload = build_workspace_search(db, "Krisp", limit=2)
    assert payload["sections"]["cases"] == {"count": 2, "total": 5}
    assert all("E2E" not in item["title"] for item in payload["results"])


def test_knowledge_search_has_an_addressable_term(db):
    payload = build_workspace_search(
        db,
        "folsomme",
        knowledge=[
            {
                "id": "personal",
                "term": "Følsomme oplysninger",
                "definition": "Vejledning om persondata",
                "tags": ["GDPR"],
            }
        ],
    )
    assert payload["results"][0]["type"] == "guidance"
    assert (
        payload["results"][0]["action"]["route"]
        == "/videnbase?query=F%C3%B8lsomme%20oplysninger"
    )


def test_query_never_selects_full_assessment_or_document_bodies(db):
    case_and_assessment(db)
    statements = []

    def collect(_connection, _cursor, statement, *_):
        statements.append(statement)

    event.listen(db.get_bind(), "before_cursor_execute", collect)
    try:
        build_workspace_search(db, "Krisp")
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", collect)
    sql = " ".join(statements).lower()
    assert "request_payload" not in sql
    assert "result_payload" not in sql
    assert "municipal_documents.description" not in sql
    assert "case_workspace_references.details" not in sql


def test_http_search_requires_workspace_roles_and_validates_query(db, monkeypatch):
    # Register the real endpoint alone: no schedulers, network sync or live DB.
    import main

    app = FastAPI()
    app.get("/api/search/global")(main.global_search)
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(main, "load_knowledge_base", lambda: [])
    principal = UserPrincipal(
        oid="reader",
        name="Reader",
        username="reader@example.invalid",
        roles=[],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    app.dependency_overrides[get_current_user] = lambda: principal
    client = TestClient(app)
    assert client.get("/api/search/global?q=Krisp").status_code == 403
    principal = UserPrincipal(
        oid="reader",
        name="Reader",
        username="reader@example.invalid",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    app.dependency_overrides[get_current_user] = lambda: principal
    case_and_assessment(db)
    response = client.get("/api/search/global?q=Krips")
    assert response.status_code == 200, response.text
    assert response.json()["sections"]["cases"]["total"] == 1
    assert client.get("/api/search/global?q=k").status_code == 422
    assert client.get("/api/search/global?q=Krisp&limit=100").status_code == 422
