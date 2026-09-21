"""Clarifications remain case-bound, explicit, idempotent and evidence-backed."""

from copy import deepcopy

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from src.api import case_clarifications as api
from src.auth import UserPrincipal
from src.database.cases import Case
from src.database.case_workspace import CaseAction
from src.database.connection import Base, get_db
from src.database.procurement import ProcurementAnalysis


QUESTIONS = [
    {"id": "dpa", "question": "Foreligger der en underskrevet databehandleraftale?", "topic": "Aftalegrundlag", "priority": "high"},
    {"id": "retention", "question": "Hvornår slettes kommunens oplysninger?", "topic": "Sletning", "priority": "normal"},
]


@pytest.fixture
def setup(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'clarifications.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add_all([Case(id="case-a", case_id="FS-A", title="Fagsystem A"), Case(id="case-b", case_id="FS-B", title="Fagsystem B")])
        db.flush()
        db.add(ProcurementAnalysis(id="analysis-a", case_id="case-a", profile_fingerprint="profile", source_fingerprint="sources", generation_payload={"questions": deepcopy(QUESTIONS), "facts": []}, model="test", generation_provider="test"))
        db.commit()
    app = FastAPI()
    app.include_router(api.router)
    def database():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[api.ACCESS] = lambda: UserPrincipal(oid="user", name="Sagsbehandler", roles=["Hammeren.Sagsbehandler"], auth_mode="development", identity_assurance="development_only")
    yield TestClient(app), factory, engine
    engine.dispose()


BASE = "/api/v3/cases/case-a/clarifications"


def create(client, **kwargs):
    return client.post(BASE, json={"analysis_id": "analysis-a", **kwargs})


def test_view_is_read_only_and_retries_keep_one_task_per_question(setup):
    client, factory, _ = setup
    assert client.get(BASE, params={"analysis_id": "analysis-a"}).json() == {"items": [], "count": 0}
    with factory() as db:
        assert db.query(CaseAction).count() == 0
    first = create(client, owner="Jura", due_date="2026-10-15")
    assert first.status_code == 200, first.text
    assert first.json()["count"] == 2
    second = create(client, owner="Anden ejer", due_date="2026-11-15")
    assert second.status_code == 200
    assert first.json() == second.json()
    with factory() as db:
        actions = db.query(CaseAction).all()
        assert len(actions) == 2
        assert all(action.category == "evidence" for action in actions)
        assert all(action.owner == "Jura" for action in actions)
        assert "juridisk godkendelse" in actions[0].description


def test_client_cannot_forge_question_or_use_analysis_from_another_case(setup):
    client, factory, _ = setup
    assert create(client, question_ids=["dpa", "invented"]).status_code == 422
    assert create(client, question_ids=["dpa", "dpa"]).status_code == 422
    assert create(client, question="Opfind en godkendelse").status_code == 422
    assert client.post("/api/v3/cases/case-b/clarifications", json={"analysis_id": "analysis-a"}).status_code == 404
    assert client.get("/api/v3/cases/case-b/clarifications?analysis_id=analysis-a").status_code == 404
    with factory() as db:
        assert db.query(CaseAction).count() == 0


def test_answer_and_status_persist_with_version_conflicts_and_clearable_fields(setup):
    client, factory, _ = setup
    item = create(client, question_ids=["dpa"], owner="Jura", due_date="2026-10-15").json()["items"][0]
    path = f"{BASE}/{item['id']}"
    token = item["updated_at"]
    assert client.patch(path, json={"expected_updated_at": token, "status": "completed", "answer": "Ja"}).status_code == 422
    answer = "Aftalen er indhentet og ligger som bilag på sagen, version 2."
    saved = client.patch(path, json={"expected_updated_at": token, "status": "completed", "answer": answer, "owner": None, "due_date": None})
    assert saved.status_code == 200, saved.text
    result = saved.json()
    assert result["answer"] == answer
    assert result["evidence_note"] == answer
    assert result["completed_at"]
    assert result["owner"] is None and result["due_date"] is None
    assert result["status"] == "completed"
    assert client.patch(path, json={"expected_updated_at": token, "owner": "Overskriv"}).status_code == 409
    assert client.patch(path, json={"owner": "Uden version"}).status_code == 422
    assert client.patch(path, json={"expected_updated_at": result["updated_at"], "answer": ""}).status_code == 422
    assert client.get(BASE + "?analysis_id=analysis-a").json()["items"][0]["answer"] == answer
    with factory() as db:
        assert db.get(ProcurementAnalysis, "analysis-a").generation_payload == {"questions": QUESTIONS, "facts": []}


def test_cross_case_updates_and_non_clarification_actions_are_rejected(setup):
    client, factory, _ = setup
    item = create(client).json()["items"][0]
    payload = {"expected_updated_at": item["updated_at"], "answer": "Anden sag må ikke ændres."}
    assert client.patch(f"/api/v3/cases/case-b/clarifications/{item['id']}", json=payload).status_code == 404
    with factory() as db:
        db.add(CaseAction(id="normal", case_db_id="case-a", title="Almindelig opgave"))
        db.commit()
    assert client.patch(BASE + "/normal", json=payload).status_code == 404


def test_batch_creation_rolls_back_every_task_when_second_insert_fails(setup):
    client, factory, engine = setup
    inserts = []
    def fail_second(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO case_actions"):
            inserts.append(statement)
            if len(inserts) == 2:
                raise OperationalError(statement, parameters, RuntimeError("injected database failure"))
    event.listen(engine, "before_cursor_execute", fail_second)
    try:
        response = create(client)
    finally:
        event.remove(engine, "before_cursor_execute", fail_second)
    assert response.status_code == 503
    with factory() as db:
        assert db.query(CaseAction).count() == 0
    assert create(client).json()["count"] == 2


def test_dismissal_needs_explanation_and_analysis_versions_keep_separate_tasks(setup):
    client, factory, _ = setup
    item = create(client, question_ids=["dpa"]).json()["items"][0]
    assert client.patch(f"{BASE}/{item['id']}", json={"expected_updated_at": item["updated_at"], "status": "dismissed"}).status_code == 422
    with factory() as db:
        db.add(ProcurementAnalysis(id="analysis-b", case_id="case-a", profile_fingerprint="profile", source_fingerprint="sources", generation_payload={"questions": deepcopy(QUESTIONS)}, model="test", generation_provider="test"))
        db.commit()
    other = client.post(BASE, json={"analysis_id": "analysis-b", "question_ids": ["dpa"]})
    assert other.status_code == 200
    assert other.json()["items"][0]["id"] != item["id"]
    assert client.get(BASE + "?analysis_id=analysis-a").json()["count"] == 1
