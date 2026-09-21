"""A new assessment from the homepage always gets an atomic case workspace."""

from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
from src.database import cases, dpia
from src.database.cases import Case, CaseTransition
from src.database.connection import Base
from src.services.legal_basis_verifier import LegalBasisVerificationResponse
from tests.test_dpia_assessment import make_assessment, valid_payload


@pytest.fixture
def api(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'new-assessment.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def get_db():
        with factory() as db:
            yield db

    previous_overrides = dict(main.app.dependency_overrides)
    main.app.dependency_overrides[main.get_db] = get_db
    monkeypatch.setattr(main, "verify_legal_basis", lambda request: LegalBasisVerificationResponse(
        status="requires_specific_basis", status_label="Kræver faglig afklaring",
        checked_at=datetime.now(UTC), selected_basis=request.legal_basis,
        specific_reference=request.legal_basis_reference, conclusion="Syntetisk offline-test.",
        receipts=[], warnings=[],
    ))
    yield TestClient(main.app), factory
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides.update(previous_overrides)
    engine.dispose()


def test_homepage_save_creates_case_and_preserves_historical_unlinked_snapshot(api):
    client, factory = api
    old_request, old_result = make_assessment()
    with factory() as db:
        historical = dpia.save_assessment(
            db, assessment_id=old_result.id, created_at=old_result.created_at,
            request_payload=old_request.model_dump(mode="json"),
            result_payload=old_result.model_dump(mode="json"),
        )
        previous_payload = deepcopy(historical.result_payload)
        db.commit()

    payload = valid_payload(project_name="E2E TEST – intern referatassistent", department="Organisationsstaben")
    response = client.post("/api/dpia/assessments", json=payload)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["case_db_id"] and result["version"] == 1
    with factory() as db:
        case = db.get(Case, result["case_db_id"])
        assert db.query(Case).count() == 1
        assert case.case_id == f"DPIA-{datetime.now(UTC).year}-{result['id']}"
        assert len(case.case_id) <= 64
        assert case.title == payload["project_name"]
        assert case.assigned_to == payload["owner"]
        assert payload["organisation"] in case.notes
        assert payload["department"] in case.notes
        assert case.last_assessment_log_id == result["id"]
        assert case.status == "vurderet"
        assert dpia.list_assessments_for_case(db, case.id)[0].id == result["id"]
        historical = db.get(dpia.DPIAAssessmentRecord, old_result.id)
        assert historical.case_db_id is None
        assert historical.result_payload == previous_payload
    reopened = client.get(f"/api/dpia/assessments/{result['id']}").json()
    assert reopened["case_db_id"] == result["case_db_id"]


def test_existing_case_is_reused_and_new_names_do_not_overwrite_it(api):
    client, factory = api
    with factory() as db:
        existing = cases.create_case(db, case_id="EXISTING-CASE", title="Oprindelig sag", assigned_to="Oprindelig ejer", notes="Oprindelig note")
        case_id = existing.id
        db.commit()
    response = client.post(f"/api/dpia/assessments?case_db_id={case_id}", json=valid_payload(project_name="Ny vurderingsversion"))
    assert response.status_code == 201, response.text
    assert response.json()["case_db_id"] == case_id
    with factory() as db:
        assert db.query(Case).count() == 1
        case = db.get(Case, case_id)
        assert (case.title, case.assigned_to, case.notes) == ("Oprindelig sag", "Oprindelig ejer", "Oprindelig note")


def test_unknown_explicit_case_does_not_create_another_case(api):
    client, factory = api
    response = client.post(f"/api/dpia/assessments?case_db_id={uuid4()}", json=valid_payload())
    assert response.status_code == 404
    with factory() as db:
        assert db.query(Case).count() == 0
        assert db.query(dpia.DPIAAssessmentRecord).count() == 0


@pytest.mark.parametrize("failure_stage", ["save_assessment", "attach_assessment"])
def test_later_failure_rolls_back_case_assessment_and_initial_transitions(api, monkeypatch, failure_stage):
    client, factory = api
    def fail(*args, **kwargs):
        raise RuntimeError("synthetic persistence failure")
    monkeypatch.setattr(dpia if failure_stage == "save_assessment" else cases, failure_stage, fail)
    response = client.post("/api/dpia/assessments", json=valid_payload())
    assert response.status_code == 503
    with factory() as db:
        assert db.query(Case).count() == 0
        assert db.query(CaseTransition).count() == 0
        assert db.query(dpia.DPIAAssessmentRecord).count() == 0


def test_separate_new_assessments_have_unique_case_identifiers(api):
    client, factory = api
    responses = [client.post("/api/dpia/assessments", json=valid_payload()) for _ in range(2)]
    assert all(response.status_code == 201 for response in responses)
    with factory() as db:
        identifiers = [case.case_id for case in db.query(Case).all()]
        assert len(identifiers) == len(set(identifiers)) == 2
