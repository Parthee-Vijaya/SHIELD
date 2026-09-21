from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from src.api.workspace import WORKSPACE_ACCESS, router
from src.auth import UserPrincipal, get_current_user
from src.database.case_workspace import (
    CaseAction,
    CaseApproval,
    add_workspace_reference,
)
from src.database.cases import create_case
from src.database.connection import Base, get_db, get_test_engine
from src.database.dpia import DPIAAssessmentRecord
from src.services.law_change_impact import (
    link_case_to_legal_source,
    register_legal_source_version,
    list_reassessments,
    update_reassessment,
)
from src.services.case_overview_service import build_case_overview


NOW = datetime(2026, 9, 20, 12, tzinfo=UTC)


@pytest.fixture()
def db():
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def make_case(
    db, suffix, *, status="vurderet", aggregate="GO", review=None, assessment=True
):
    record = create_case(
        db, case_id=suffix, title=f"Syntetisk sag {suffix}", next_review_at=review
    )
    record.status = status
    record.last_aggregate_status = aggregate
    if assessment:
        add_workspace_reference(
            db,
            case_db_id=record.id,
            reference_type="ai_act_assessment",
            reference_id=f"ai-{suffix}",
        )
        record.last_assessment_log_id = f"ai-{suffix}"
    db.flush()
    return record


def make_dpia(
    db, case_record=None, *, version=1, status="ready_for_review", created_at=NOW
):
    record = DPIAAssessmentRecord(
        id=str(uuid4()),
        case_db_id=case_record.id if case_record else None,
        version=version,
        project_name="Syntetisk DPIA",
        organisation="Testkommune",
        status=status,
        risk_level="high",
        template_version="test-1",
        request_payload={
            "department": "Digitalisering",
            "private_unrelated_field": "DO-NOT-EXPORT",
        },
        result_payload={
            "sections": [{"text": "DO-NOT-EXPORT"}],
            "risks": [],
            "ai_generation": {"evidence": "DO-NOT-EXPORT"},
        },
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(record)
    db.flush()
    return record


def make_action(db, record, *, status="open", priority="medium", category="measure"):
    db.add(
        CaseAction(
            case_db_id=record.id,
            title="Syntetisk opgave",
            status=status,
            priority=priority,
            category=category,
        )
    )
    db.flush()


def make_pending(db, record):
    db.add(
        CaseApproval(
            case_db_id=record.id,
            status="pending",
            approval_type="case",
            requested_by="Test",
            decision_snapshot={"private": "DO-NOT-EXPORT"},
        )
    )
    db.flush()


def row_for(payload, record):
    return next(row for row in payload["items"] if row["id"] == record.id)


def test_assessed_no_go_and_conditional_cases_are_actionable_without_remediation(db):
    blocked = make_case(db, "TEST-BLOCKED", aggregate="NO-GO")
    conditional = make_case(db, "TEST-CONDITIONAL", aggregate="BETINGET-GO")
    pending = make_case(db, "TEST-PENDING")
    make_pending(db, pending)
    archived = make_case(db, "TEST-ARCHIVED", status="arkiveret", aggregate="NO-GO")
    result = build_case_overview(db, now=NOW)
    assert result["stats"] == {
        "total": 4,
        "active": 3,
        "archived": 1,
        "examples": 0,
        "drafts": 0,
        "approved": 0,
        "in_operation": 0,
        "requires_action": 2,
        "awaiting_approval": 1,
        "review_overdue": 0,
        "review_due_soon": 0,
    }
    for record in (blocked, conditional):
        row = row_for(result, record)
        assert row["status"] == "vurderet"
        assert row["attention"]["kind"] == "requires_action"
        assert row["attention"]["tab"] == "assessments"
        assert row["blockers_count"] == 1
    assert row_for(result, pending)["attention"]["kind"] == "awaiting_approval"
    assert row_for(result, pending)["blockers_count"] == 0
    assert row_for(result, archived)["attention"]["kind"] == "archived"


def test_pending_approval_never_hides_new_blocking_actions_and_nonblocking_tasks_are_actionable(
    db,
):
    blocked = make_case(db, "TEST-ACTIONS")
    make_pending(db, blocked)
    make_action(db, blocked, priority="high")
    make_action(db, blocked, priority="low", category="condition")
    make_action(db, blocked, priority="critical", status="completed")
    make_action(db, blocked, priority="high", status="dismissed")
    follow_up = make_case(db, "TEST-FOLLOWUP")
    make_action(db, follow_up, category="follow_up")
    result = build_case_overview(db, now=NOW)
    row = row_for(result, blocked)
    assert (
        row["open_action_count"],
        row["blockers_count"],
        row["pending_approval_count"],
    ) == (2, 2, 1)
    assert row["attention"]["kind"] == "requires_action"
    assert row["attention"]["tab"] == "measures"
    assert result["stats"]["requires_action"] == 2
    assert result["stats"]["awaiting_approval"] == 1
    assert row_for(result, follow_up)["blockers_count"] == 0
    assert row_for(result, follow_up)["attention"]["kind"] == "requires_action"


def test_latest_dpia_version_wins_and_go_screening_cannot_hide_blocked_dpia(db):
    record = make_case(db, "TEST-VERSIONS", aggregate="GO")
    make_dpia(db, record, version=1, status="ready_for_review", created_at=NOW)
    blocked = make_dpia(
        db, record, version=2, status="blocked", created_at=NOW - timedelta(minutes=1)
    )
    result = build_case_overview(db, now=NOW)
    assert row_for(result, record)["latest_assessment"]["id"] == blocked.id
    assert row_for(result, record)["attention"]["kind"] == "requires_action"
    # Old blocked versions must not poison a later corrected assessment.
    ready = make_dpia(db, record, version=3, created_at=NOW + timedelta(minutes=1))
    result = build_case_overview(db, now=NOW)
    assert row_for(result, record)["latest_assessment"]["id"] == ready.id
    assert row_for(result, record)["blockers_count"] == 0
    assert row_for(result, record)["attention"]["kind"] == "ready_for_approval"


def test_review_horizon_uses_danish_days_and_excludes_missing_and_archived_dates(db):
    overdue = make_case(
        db,
        "TEST-OVERDUE",
        status="idriftsat",
        review=(NOW - timedelta(days=1)).replace(tzinfo=None),
    )
    soon = make_case(db, "TEST-SOON", review=NOW + timedelta(days=30))
    make_case(db, "TEST-TODAY", review=NOW - timedelta(hours=10))
    make_case(db, "TEST-FUTURE", review=NOW + timedelta(days=31))
    make_case(db, "TEST-NODATE")
    make_case(db, "TEST-OLD", status="arkiveret", review=NOW - timedelta(days=1))
    result = build_case_overview(db, now=NOW)
    assert result["stats"]["review_overdue"] == 1
    assert result["stats"]["review_due_soon"] == 2
    assert result["stats"]["requires_action"] == 1
    assert row_for(result, overdue)["attention"]["kind"] == "review_due"
    assert row_for(result, soon)["attention"]["kind"] == "review_due"
    assert row_for(result, overdue)["next_review_at"].endswith("+00:00")


def test_scope_limit_and_recent_versions_are_truthful_and_payloads_are_not_exposed(db):
    example = make_case(db, "EKSEMPEL-TEST-1", aggregate="NO-GO")
    normal = make_case(db, "TEST-REAL", aggregate="GO")
    normal.title = "EKSEMPEL in a title does not classify the case"
    make_case(db, "TEST-ARCHIVED", status="arkiveret")
    example_dpia = make_dpia(db, example, status="blocked")
    normal_dpia = make_dpia(db, normal)
    orphan_dpia = make_dpia(db, created_at=NOW - timedelta(days=1))
    all_result = build_case_overview(db, now=NOW, limit=1)
    assert (all_result["count"], all_result["total"], all_result["truncated"]) == (
        1,
        3,
        True,
    )
    assert all_result["stats"]["total"] == 3
    assert all_result["stats"]["examples"] == 1
    work = build_case_overview(db, scope="work", now=NOW)
    examples = build_case_overview(db, scope="examples", now=NOW)
    assert {a["id"] for a in work["latest_assessments"]} == {
        normal_dpia.id,
        orphan_dpia.id,
    }
    assert [a["id"] for a in examples["latest_assessments"]] == [example_dpia.id]
    assert (work["total"], examples["total"]) == (2, 1)
    assert all(row["is_example"] for row in examples["items"])
    assert all(not row["is_example"] for row in work["items"])
    assert normal_dpia.id in row_for(work, normal)["latest_assessment"]["href"]
    assert row_for(work, normal)["latest_assessment"]["department"] == "Digitalisering"
    assert "DO-NOT-EXPORT" not in str(all_result)
    assert "request_payload" not in str(all_result)
    assert "result_payload" not in str(all_result)


def test_drafts_and_old_workflow_flags_do_not_create_fake_approval_requests(db):
    draft = make_case(
        db, "TEST-DRAFT", status="kladde", aggregate=None, assessment=False
    )
    approved = make_case(db, "TEST-APPROVED", status="godkendt")
    assessed = make_case(db, "TEST-ASSESSED")
    result = build_case_overview(db, now=NOW)
    assert result["stats"]["awaiting_approval"] == 0
    assert result["stats"]["requires_action"] == 0
    assert row_for(result, draft)["attention"]["kind"] == "draft"
    assert row_for(result, approved)["attention"]["kind"] == "approved"
    assert row_for(result, assessed)["attention"]["kind"] == "ready_for_approval"


def test_query_count_is_constant_and_endpoint_is_read_only(db):
    for index in range(20):
        record = make_case(db, f"TEST-{index}")
        make_dpia(db, record)
        make_action(db, record)
        make_pending(db, record)
    db.commit()
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        result = build_case_overview(db, now=NOW)
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    assert result["total"] == 20
    assert len(statements) == 7
    assert all(
        statement.lstrip().upper().startswith("SELECT") for statement in statements
    )
    assert not db.new and not db.dirty and not db.deleted


def test_overview_route_validates_scope_and_limit_and_uses_existing_auth(db):
    principal = UserPrincipal(
        oid="test-oid",
        name="Test",
        username="test@example.invalid",
        roles=["Hammeren.Sagsbehandler"],
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )
    app = FastAPI()
    app.include_router(router)

    def database():
        yield db

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[WORKSPACE_ACCESS] = lambda: principal
    with TestClient(app) as client:
        assert client.get("/api/v3/cases/overview").status_code == 200
        assert client.get("/api/v3/cases/overview?scope=other").status_code == 422
        assert client.get("/api/v3/cases/overview?limit=501").status_code == 422
        assert client.get("/api/v3/cases/overview?limit=0").status_code == 422
    route = next(
        route for route in router.routes if route.path == "/api/v3/cases/overview"
    )
    assert WORKSPACE_ACCESS in {
        dependency.call for dependency in route.dependant.dependencies
    }


def test_open_legal_reassessment_requires_action_even_when_case_is_in_operation(db):
    record = make_case(db, "TEST-LAW", status="idriftsat")
    baseline = register_legal_source_version(
        db,
        source_key="test:law",
        title="Syntetisk retskilde",
        authority="Test",
        source_url="https://example.invalid/law",
        content_sha256="a" * 64,
    )
    link_case_to_legal_source(
        db,
        case_db_id=record.id,
        source_id=baseline.source.id,
        article_reference="Artikel 1",
        linked_by="Test",
    )
    register_legal_source_version(
        db,
        source_key="test:law",
        title="Syntetisk retskilde",
        authority="Test",
        source_url="https://example.invalid/law",
        content_sha256="b" * 64,
    )
    record.next_review_at = NOW + timedelta(days=10)
    db.flush()
    result = build_case_overview(db, now=NOW)
    assert result["stats"]["requires_action"] == 1
    assert row_for(result, record)["blockers_count"] == 1
    assert row_for(result, record)["attention"]["label"] == "Genvurdering nødvendig"
    reassessment = list_reassessments(db, case_db_id=record.id)[0]
    update_reassessment(
        db,
        reassessment.id,
        status="completed",
        resolved_by="Test",
        resolution_note="Ændringen er vurderet og dokumenteret i denne syntetiske test.",
    )
    result = build_case_overview(db, now=NOW)
    assert result["stats"]["requires_action"] == 0
    assert row_for(result, record)["blockers_count"] == 0
    assert row_for(result, record)["attention"]["kind"] == "review_due"
    assert result["stats"]["review_due_soon"] == 1


@pytest.mark.parametrize(
    "roles,expected",
    [
        ([], 403),
        (["Unrelated.Role"], 403),
        (["Hammeren.Sagsbehandler"], 200),
        (["Hammeren.Godkender"], 200),
        (["Hammeren.DPO"], 200),
        (["Hammeren.Admin"], 200),
    ],
)
def test_overview_enforces_all_four_case_access_roles(db, roles, expected):
    app = FastAPI()
    app.include_router(router)
    principal = UserPrincipal(
        oid="test-principal",
        name="Test",
        roles=roles,
        auth_mode="entra",
        identity_assurance="verified_entra_token",
    )

    def database():
        yield db

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: principal
    with TestClient(app) as client:
        assert client.get("/api/v3/cases/overview").status_code == expected


@pytest.mark.parametrize(
    "now_iso,review_iso,overdue,upcoming",
    [
        # Copenhagen midnight is 22:00 UTC in summer and 23:00 UTC in winter.
        ("2026-07-10T21:59:59+00:00", "2026-07-10T10:00:00+00:00", 0, 1),
        ("2026-07-10T22:00:00+00:00", "2026-07-10T10:00:00+00:00", 1, 0),
        ("2026-01-10T22:59:59+00:00", "2026-01-10T11:00:00+00:00", 0, 1),
        ("2026-01-10T23:00:00+00:00", "2026-01-10T11:00:00+00:00", 1, 0),
        # A prior UTC date can still mean today's Danish review date.
        ("2026-01-11T12:00:00+00:00", "2026-01-10T23:30:00+00:00", 0, 1),
        # First daylight-saving day and first standard-time day use different offsets.
        ("2026-03-29T21:59:59+00:00", "2026-03-29T10:00:00+00:00", 0, 1),
        ("2026-03-29T22:00:00+00:00", "2026-03-29T10:00:00+00:00", 1, 0),
        ("2026-10-25T22:59:59+00:00", "2026-10-25T11:00:00+00:00", 0, 1),
        ("2026-10-25T23:00:00+00:00", "2026-10-25T11:00:00+00:00", 1, 0),
        # Include the whole 30th calendar day, then exclude the 31st.
        ("2026-09-20T12:00:00+00:00", "2026-10-20T21:59:59+00:00", 0, 1),
        ("2026-09-20T12:00:00+00:00", "2026-10-20T22:00:00+00:00", 0, 0),
    ],
)
def test_review_calendar_boundaries(db, now_iso, review_iso, overdue, upcoming):
    review_at = datetime.fromisoformat(review_iso)
    record = make_case(db, "TEST-CALENDAR", status="idriftsat", review=review_at)
    result = build_case_overview(db, now=datetime.fromisoformat(now_iso))
    assert result["stats"]["review_overdue"] == overdue
    assert result["stats"]["review_due_soon"] == upcoming
    assert result["stats"]["requires_action"] == overdue
    expected_label = (
        "Reviewfristen er nået"
        if overdue
        else "Review inden for 30 dage" if upcoming else "I drift"
    )
    assert row_for(result, record)["attention"]["label"] == expected_label
    # Only the interpretation changes; the saved timestamp is untouched.
    assert record.next_review_at == review_at
