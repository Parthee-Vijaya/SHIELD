"""Technical fixtures stay addressable without appearing as municipal work."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from src.database.cases import Case, create_case, get_case, list_cases
from src.database.connection import Base, get_test_engine
from src.database.dpia import (
    DPIAAssessmentRecord,
    get_assessment,
    list_assessments,
    list_assessments_for_case,
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


def assessment(db, name, *, case=None, days=0):
    record = DPIAAssessmentRecord(
        id=str(uuid4()),
        case_db_id=case.id if case else None,
        version=1,
        project_name=name,
        organisation="Testkommune",
        status="blocked",
        risk_level="high",
        template_version="test-1",
        request_payload={"project_name": name, "department": "Digitalisering"},
        result_payload={"original_name": name, "risks": [{"id": "3.1", "score": 9}]},
        created_at=NOW + timedelta(days=days),
        updated_at=NOW + timedelta(days=days),
    )
    db.add(record)
    db.flush()
    return record


@pytest.mark.parametrize(
    "title",
    [
        "E2E TEST – intern referatassistent",
        "E2E-test af sag",
        "  e2e test af system",
        "e2e-TEST – dokumenter",
    ],
)
def test_technical_case_hidden_before_limit_but_uuid_and_case_versions_stay_available(
    db, title
):
    work = create_case(db, case_id="K-2026-001", title="Fagsystem til pladsanvisning")
    work.updated_at = NOW
    hidden = create_case(db, case_id="DPIA-2026-fixture", title=title)
    hidden.updated_at = NOW + timedelta(days=1)
    original = assessment(db, "Neutral historisk version", case=hidden)
    db.flush()

    assert [item.id for item in list_cases(db, limit=1)] == [work.id]
    assert get_case(db, hidden.id).title == title
    assert get_assessment(db, original.id).project_name == "Neutral historisk version"
    assert [item.id for item in list_assessments_for_case(db, hidden.id)] == [
        original.id
    ]
    assert list_assessments(db) == ([], 0)
    assert db.query(Case).count() == 2


def test_history_filter_applies_to_unlinked_titles_and_parent_cases_before_count_and_offset(
    db,
):
    work = create_case(
        db, case_id="K-2026-002", title="Fagsystem til skoleadministration"
    )
    technical = create_case(
        db, case_id="DPIA-fixture", title="E2E TEST – intern funktion"
    )
    first = assessment(db, "Fagsystem til skoleadministration", case=work)
    second = assessment(db, "Historisk kommunal vurdering", days=1)
    hidden_linked = assessment(db, "Neutral projektoverskrift", case=technical, days=4)
    hidden_unlinked = assessment(db, "E2E-test – historisk kontrol", days=3)
    hidden_version = assessment(db, "E2E TEST – særskilt kontrol", case=work, days=2)
    snapshots = {
        item.id: deepcopy(item.result_payload)
        for item in [first, second, hidden_linked, hidden_unlinked, hidden_version]
    }
    db.commit()

    page_one, total = list_assessments(db, limit=1)
    page_two, total_two = list_assessments(db, limit=1, offset=1)
    page_three, total_three = list_assessments(db, limit=1, offset=2)
    assert total == total_two == total_three == 2
    assert [item.id for item in page_one] == [second.id]
    assert [item.id for item in page_two] == [first.id]
    assert page_three == []
    assert {
        item.id: item.result_payload for item in db.query(DPIAAssessmentRecord)
    } == snapshots
    assert not db.dirty


def test_overview_hides_technical_cases_and_recent_versions_for_every_scope(db):
    work = create_case(db, case_id="K-2026-003", title="Sundhedsfaglig dokumentation")
    example = create_case(
        db, case_id="EKSEMPEL-2026-001", title="EKSEMPEL · Fiktiv indkøbssag"
    )
    hidden = create_case(
        db, case_id="DPIA-fixture", title="E2E TEST – intern referatassistent"
    )
    hidden_example = create_case(
        db, case_id="EKSEMPEL-fixture", title="E2E-test – teknisk eksempel"
    )
    visible = assessment(db, "Sundhedsfaglig dokumentation", case=work)
    example_version = assessment(db, "Eksempel på indkøbsvurdering", case=example)
    assessment(db, "Neutral titel", case=hidden, days=2)
    assessment(db, "E2E TEST – uden sag", days=3)
    assessment(db, "Neutral eksempeltitel", case=hidden_example, days=4)

    combined = build_case_overview(db, scope="all", limit=1, now=NOW)
    assert combined["total"] == combined["stats"]["total"] == 2
    assert combined["count"] == 1
    assert combined["truncated"] is True
    assert {item["id"] for item in combined["latest_assessments"]} == {
        visible.id,
        example_version.id,
    }
    for scope, selected, version in [
        ("work", work, visible),
        ("examples", example, example_version),
    ]:
        result = build_case_overview(db, scope=scope, now=NOW)
        assert result["total"] == result["stats"]["active"] == 1
        assert [item["id"] for item in result["items"]] == [selected.id]
        assert [item["id"] for item in result["latest_assessments"]] == [version.id]


def test_ordinary_names_and_explicit_examples_are_not_broadly_filtered(db):
    names = [
        "Test af økonomisystem",
        "EKSEMPEL · Fagsystem til socialområdet",
        "System til E2E dokumentation",
        "E2E leverandørportal",
    ]
    created = [
        create_case(db, case_id=f"K-{index}", title=name)
        for index, name in enumerate(names)
    ]
    assert {item.id for item in list_cases(db)} == {item.id for item in created}
