"""Human controls have separate state, strict boundaries and immutable JEV history."""

from copy import deepcopy
import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import event, inspect
from sqlalchemy.exc import SQLAlchemyError

from src.auth import get_current_user
from src.database.connection import Base, get_test_engine
from src.database.dpia import DPIAAssessmentRecord
from src.database.technical_controls import (
    TechnicalControlPoint,
    TechnicalControlPointRevision,
)
from tests.test_technical_runs import (
    ai_payload,
    get_runs,
    save_dpia,
    setup as technical_run_fixture,
)

setup = technical_run_fixture


def create(setup, assessment_id, **fields):
    return setup["client"].post(
        f"/api/v3/cases/{setup['case']}/technical-controls",
        json={
            "assessment_id": assessment_id,
            "question": "Er sletningen dokumenteret?",
            **fields,
        },
    )


def patch(setup, control, **fields):
    return setup["client"].patch(
        f"/api/v3/cases/{setup['case']}/technical-controls/{control['id']}",
        json={
            "expected_version": control["version"],
            **fields,
        },
    )


def test_human_follow_up_audit_reload_and_immutable_original(setup):
    original = ai_payload()
    assessment_id = save_dpia(setup, original)
    before = deepcopy(get_runs(setup)[0]["review"])
    commits = []

    def callback(session):
        commits.append(True)

    event.listen(setup["factory"].class_, "after_commit", callback)
    try:
        response = create(setup, assessment_id, original_check_id="summary", owner="")
        assert response.status_code == 201, response.text
        control = response.json()
        assert len(commits) == 1
        assert (
            control["origin"] == "human"
            and control["requires_new_review"]
            and not control["jev_reviewed"]
        )
        assert control["history"][0]["actor_id"] == "reviewer"
        assert control["history"][0]["identity_assurance"] == "verified_entra_token"
        response = patch(
            setup,
            control,
            question="Er sletning efter 30 dage eftervist?",
            notes="Afventer dokumentation.",
            owner="IT-sikkerhed",
            status="completed",
        )
        assert response.status_code == 200, response.text
        assert len(commits) == 2
    finally:
        event.remove(setup["factory"].class_, "after_commit", callback)
    updated = response.json()
    assert (
        updated["version"] == 2
        and updated["requires_new_review"]
        and not updated["jev_reviewed"]
    )
    assert [entry["version"] for entry in updated["history"]] == [2, 1]
    assert updated["history"][1]["snapshot"]["question"] == control["question"]
    assert updated["history"][0]["actor_name"] == "Reviewer"
    run = get_runs(setup)[0]
    assert run["human_controls"] == [updated]
    assert run["review"] == before
    with setup["factory"]() as db:
        assert db.get(DPIAAssessmentRecord, assessment_id).result_payload == original


def test_custom_controls_can_be_archived_with_history_but_not_model_approval(setup):
    assessment_id = save_dpia(setup, ai_payload())
    first = create(setup, assessment_id).json()
    second = create(
        setup, assessment_id, question="Er adgangsrollen kontrolleret?"
    ).json()
    assert first["id"] != second["id"] and first["original_check_id"] is None
    response = patch(setup, first, status="dismissed")
    assert response.status_code == 200
    assert response.json()["requires_new_review"] is True
    assert len(get_runs(setup)[0]["human_controls"]) == 2


def test_cross_case_and_cross_version_references_are_rejected(setup):
    own_id = save_dpia(setup, ai_payload())
    other_id = save_dpia(setup, ai_payload(), case_id=setup["other"])
    assert create(setup, other_id).status_code == 404
    assert create(setup, own_id, original_check_id="absent-check").status_code == 404
    control = create(setup, own_id).json()
    response = setup["client"].patch(
        f"/api/v3/cases/{setup['other']}/technical-controls/{control['id']}",
        json={"expected_version": 1, "status": "completed"},
    )
    assert response.status_code == 404
    other_run = (
        setup["client"]
        .get(f"/api/v3/cases/{setup['other']}/technical-runs")
        .json()["runs"][0]
    )
    assert other_run["human_controls"] == []
    new_id = save_dpia(setup, ai_payload(), version=2)
    assert (
        next(run for run in get_runs(setup) if run["assessment_id"] == new_id)[
            "human_controls"
        ]
        == []
    )


def test_original_control_override_unique_and_stale_version_conflicts(setup):
    assessment_id = save_dpia(setup, ai_payload())
    control = create(setup, assessment_id, original_check_id="summary").json()
    assert create(setup, assessment_id, original_check_id="summary").status_code == 409
    assert patch(setup, control, notes="Første ændring").status_code == 200
    assert patch(setup, control, notes="Forældet ændring").status_code == 409
    saved = get_runs(setup)[0]["human_controls"][0]
    assert saved["notes"] == "Første ændring" and len(saved["history"]) == 2


@pytest.mark.parametrize(
    "fields",
    [
        {"question": "  "},
        {"question": 4},
        {"question": "x" * 2001},
        {"notes": "x" * 12001},
        {"owner": "x" * 201},
        {"status": "approved"},
        {"probability": 0},
        {"requires_review": False},
        {"actor_id": "someone-else"},
        {"jev_reviewed": True},
        {"requires_new_review": False},
    ],
)
def test_create_strict_validation_cannot_edit_jev_or_actor(setup, fields):
    assessment_id = save_dpia(setup, ai_payload())
    assert create(setup, assessment_id, **fields).status_code == 422
    with setup["factory"]() as db:
        assert db.query(TechnicalControlPoint).count() == 0
        assert db.query(TechnicalControlPointRevision).count() == 0


@pytest.mark.parametrize(
    "fields",
    [
        {},
        {"question": None},
        {"status": None},
        {"expected_version": True, "notes": "x"},
        {"assessment_id": "different"},
        {"original_check_id": "section:1.1"},
        {"probability": 0},
        {"review_status": "approved"},
    ],
)
def test_patch_rejects_invalid_or_machine_fields(setup, fields):
    control = create(setup, save_dpia(setup, ai_payload())).json()
    assert patch(setup, control, **fields).status_code == 422
    assert get_runs(setup)[0]["human_controls"][0]["version"] == 1


@pytest.mark.parametrize("kind", ["create", "update"])
def test_audit_failure_rolls_back_entire_mutation_without_sensitive_error(
    setup, monkeypatch, kind
):
    assessment_id = save_dpia(setup, ai_payload())
    control = create(setup, assessment_id).json() if kind == "update" else None

    def fail(*args):
        raise SQLAlchemyError("private database connection text")

    monkeypatch.setattr("src.services.technical_controls._audit", fail)
    response = (
        create(setup, assessment_id)
        if kind == "create"
        else patch(setup, control, notes="Must roll back")
    )
    assert response.status_code == 503 and "private" not in response.text
    with setup["factory"]() as db:
        assert db.query(TechnicalControlPoint).count() == (1 if control else 0)
        assert db.query(TechnicalControlPointRevision).count() == (1 if control else 0)
        if control:
            assert db.get(TechnicalControlPoint, control["id"]).version == 1
            assert db.get(TechnicalControlPoint, control["id"]).notes == ""


def test_mutations_require_workspace_role(setup):
    assessment_id = save_dpia(setup, ai_payload())
    control = create(setup, assessment_id).json()
    principal = setup["principal"].model_copy(update={"roles": []})
    setup["app"].dependency_overrides[get_current_user] = lambda: principal
    assert create(setup, assessment_id).status_code == 403
    assert patch(setup, control, notes="not allowed").status_code == 403


def test_recorded_question_criteria_and_grounding_are_read_only_and_allowlisted(setup):
    payload = ai_payload()
    payload["ai_generation"]["review"]["checks"][0].update(
        question="Understøttes resuméet?",
        criteria_text="Stemmer med dokumenterne.",
        grounding="Den gemte formulering.",
        private_field="must-not-leak",
    )
    save_dpia(setup, payload)
    check = get_runs(setup)[0]["review"]["checks"][0]
    assert check["question"] == "Understøttes resuméet?"
    assert check["criteria_text"] == "Stemmer med dokumenterne."
    assert check["grounding"] == "Den gemte formulering."
    assert "private_field" not in check


@pytest.mark.parametrize("runtime_created", [False, True])
def test_migration_handles_legacy_and_runtime_schema_without_data_loss(runtime_created):
    engine = get_test_engine()
    tables = list(Base.metadata.sorted_tables)
    excluded = {"technical_control_points", "technical_control_point_revisions"}
    Base.metadata.create_all(
        engine,
        tables=(
            tables
            if runtime_created
            else [table for table in tables if table.name not in excluded]
        ),
    )
    path = (
        Path(__file__).parents[1]
        / "alembic/versions/e7a4b9c2d610_add_human_technical_controls.py"
    )
    spec = importlib.util.spec_from_file_location("human_controls_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO cases (id, case_id, title, status, created_at, updated_at) VALUES ('legacy-case', 'K-LEGACY', 'Bevar sagen', 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.upgrade()
        assert excluded.issubset(inspect(connection).get_table_names())
        assert (
            connection.exec_driver_sql(
                "SELECT title FROM cases WHERE id='legacy-case'"
            ).scalar_one()
            == "Bevar sagen"
        )
        for model in (TechnicalControlPoint, TechnicalControlPointRevision):
            columns = {
                column["name"]
                for column in inspect(connection).get_columns(model.__tablename__)
            }
            assert columns == set(model.__table__.columns.keys())
    engine.dispose()
