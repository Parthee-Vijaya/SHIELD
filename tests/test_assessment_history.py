from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from src.api.assessment_history import router, WORKSPACE_ACCESS
from src.database.connection import Base, get_db, get_test_engine
from src.database.cases import create_case
from src.database.case_workspace import add_workspace_reference
from src.database.dpia import DPIAAssessmentRecord
from src.rule_engine.audit import V3AssessmentLog
from src.services.assessment_history import build_assessment_history, group_history
from src.services.case_overview_service import build_case_overview

NOW = datetime(2026, 9, 25, 10, tzinfo=UTC)


@pytest.fixture
def db():
    engine = get_test_engine()
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def dpia(db, case=None, version=1, *, parent=None, created=None, status="blocked"):
    row = DPIAAssessmentRecord(
        id=str(uuid4()),
        case_db_id=case.id if case else None,
        version=version,
        project_name="Kommunal mødeassistent",
        organisation="Kommune",
        status=status,
        risk_level="high",
        template_version="1",
        request_payload={"owner": "Oplyst ejer", "secret": "DO-NOT-EXPORT"},
        result_payload={
            "parent_assessment_id": parent,
            "sections": [{"text": "DO-NOT-EXPORT"}],
            "ai_generation": {
                "model": "gpt-5.6-sol",
                "started_at": "2026-09-25T09:00:00",
                "prompt": "DO-NOT-EXPORT",
            },
        },
        created_at=created or NOW,
        updated_at=created or NOW,
    )
    db.add(row)
    db.flush()
    return row


def test_groups_before_pagination_and_preserves_each_category_and_snapshot(db):
    case = create_case(
        db, case_id="K-1", title="Mødeassistent", assigned_to="Sagsansvarlig"
    )
    one = dpia(db, case, 1, status="GO")
    newest = dpia(db, case, 3)
    dpia(db, case, 2)
    for category in ["ai_act_assessment", "fria_assessment"]:
        add_workspace_reference(
            db,
            case_db_id=case.id,
            reference_type=category,
            reference_id=category + "-1",
            source_version="methodology-7",
            details={
                "result": {"workflow_status": "requires_action"},
                "request": {"system_name": "Mødeassistent"},
            },
        )
    other = create_case(db, case_id="K-2", title="Mødeassistent")
    dpia(db, other)
    payload = build_assessment_history(db, limit=1)
    assert payload["count"] == 4 and payload["version_count"] == 6
    all_groups = [
        build_assessment_history(db, limit=1, offset=n)["items"][0] for n in range(4)
    ]
    group = next(
        g
        for g in all_groups
        if g["category"] == "dpia" and g["latest"]["case_db_id"] == case.id
    )
    assert group["latest"]["id"] == newest.id
    assert [v["version"] for v in group["older_versions"]] == [2, 1]
    assert group["latest"]["owner"] == "Oplyst ejer"
    assert group["latest"]["case_owner"] == "Sagsansvarlig"
    assert group["latest"]["initiated_at"] == "2026-09-25T09:00:00+00:00"
    assert group["older_versions"][-1]["id"] == one.id
    assert "DO-NOT-EXPORT" not in str(all_groups)
    assert "request_payload" not in str(all_groups)
    assert all(
        g["latest"]["version"] is None
        for g in all_groups
        if g["category"] in ["ai_act", "fria"]
    )
    assert build_assessment_history(db, category="dpia", status="GO")["count"] == 0
    assert build_assessment_history(db, search="Sagsansvarlig")["count"] == 3


def test_unattached_equal_names_stay_separate_unless_explicit_lineage(db):
    first = dpia(db)
    revised = dpia(db, version=2, parent=first.id)
    unrelated = dpia(db)
    groups = build_assessment_history(db)["items"]
    assert len(groups) == 2
    assert {g["version_count"] for g in groups} == {1, 2}
    lineage = next(g for g in groups if g["version_count"] == 2)
    assert lineage["latest"]["id"] == revised.id
    assert lineage["older_versions"][0]["id"] == first.id
    assert any(g["latest"]["id"] == unrelated.id for g in groups)
    assert all(g["latest"]["case_db_id"] is None for g in groups)


def test_missing_parent_and_cycles_do_not_drop_or_merge_unrelated_snapshots():
    items = [
        {"id": i, "category": "dpia", "parent_assessment_id": p}
        for i, p in [
            ("a", "b"),
            ("b", "a"),
            ("c", "missing"),
            ("d", "missing"),
            ("e", None),
        ]
    ]
    groups = group_history(items)
    assert sorted(g["version_count"] for g in groups) == [1, 2, 2]
    assert sum(g["version_count"] for g in groups) == 5


def test_audits_without_case_keep_identity_and_unknown_metadata_is_honest(db):
    for i in range(2):
        db.add(
            V3AssessmentLog(
                id=f"legacy-{i}",
                case_id=None,
                user_id="actor-id",
                created_at=NOW,
                rule_engine_version="3.4",
                aggregate_status="GO",
                rules_loaded="5",
                request_payload={"system_description": "Secret description"},
                response_payload={},
            )
        )
    db.flush()
    payload = build_assessment_history(db)
    assert payload["count"] == 2
    for group in payload["items"]:
        item = group["latest"]
        assert item["version"] is None and item["project_name"] is None
        assert (
            item["owner"] is None
            and item["created_by"] is None
            and item["initiated_at"] is None
        )
        assert item["created_at"] == NOW.isoformat()
        assert item["href"].startswith("/historik/legacy-")
    assert "actor-id" not in str(payload) and "Secret description" not in str(payload)


def test_metadata_owner_override_clear_and_overview_latest_versions(db):
    case = create_case(
        db, case_id="K-3", title="Mødeassistent", assigned_to="Nuværende sagsansvarlig"
    )
    old = dpia(db, case, 1, created=NOW - timedelta(hours=1))
    latest = dpia(db, case, 2)
    reference = add_workspace_reference(
        db,
        case_db_id=case.id,
        reference_type="dpia_assessment",
        reference_id=latest.id,
        details={
            "workspace_metadata": {
                "owner": "Redigeret ejer",
                "updated_at": NOW.isoformat(),
            }
        },
        created_by="Registreret aktør",
    )
    payload = build_assessment_history(db)
    assert payload["items"][0]["latest"]["owner"] == "Redigeret ejer"
    recent = build_case_overview(db)["latest_assessments"]
    assert (
        len(recent) == 1
        and recent[0]["id"] == latest.id
        and recent[0]["version_count"] == 2
    )
    assert (
        recent[0]["owner"] == "Redigeret ejer"
        and recent[0]["case_owner"] == "Nuværende sagsansvarlig"
    )
    assert old.id != recent[0]["id"]
    reference.details = {
        "workspace_metadata": {"owner": None, "updated_at": NOW.isoformat()}
    }
    db.flush()
    assert build_assessment_history(db)["items"][0]["latest"]["owner"] is None
    assert build_case_overview(db)["latest_assessments"][0]["owner"] is None


def test_history_query_count_constant_and_no_mutations(db):
    for i in range(4):
        case = create_case(db, case_id=f"K-{i}", title=f"Kommunal løsning {i}")
        dpia(db, case)
    db.commit()
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        payload = build_assessment_history(db)
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    assert len(statements) == 4
    assert all(s.lstrip().upper().startswith("SELECT") for s in statements)
    assert payload["count"] == 4 and not db.new and not db.dirty and not db.deleted


def test_history_endpoint_uses_existing_access_gate_and_validates_parameters(db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db

    def denied():
        raise HTTPException(403, "No access")

    app.dependency_overrides[WORKSPACE_ACCESS] = denied
    client = TestClient(app)
    assert client.get("/api/v3/assessment-history").status_code == 403
    app.dependency_overrides[WORKSPACE_ACCESS] = lambda: object()
    assert client.get("/api/v3/assessment-history").status_code == 200
    for suffix in ["limit=0", "limit=51", "offset=-1", "category=unknown"]:
        assert client.get("/api/v3/assessment-history?" + suffix).status_code == 422


def test_newer_unnumbered_snapshot_is_not_hidden_by_old_version_number():
    groups = group_history(
        [
            {
                "id": "old",
                "category": "ai_act",
                "case_db_id": "case-1",
                "version": 9,
                "created_at": "2026-09-20T10:00:00+00:00",
            },
            {
                "id": "new",
                "category": "ai_act",
                "case_db_id": "case-1",
                "version": None,
                "created_at": "2026-09-25T10:00:00+00:00",
            },
        ]
    )
    assert groups[0]["latest"]["id"] == "new"
    assert groups[0]["older_versions"][0]["id"] == "old"
