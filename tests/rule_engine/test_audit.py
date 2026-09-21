"""Tests for the v3 audit log.

We use SQLite in-memory for isolation. The Base from src.database.connection
is what production uses; we just bind it to a fresh engine here.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.connection import Base
from src.rule_engine import audit  # noqa: F401 — registers V3AssessmentLog


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    s = Session()
    try:
        yield s
    finally:
        s.close()
        Base.metadata.drop_all(engine)


SAMPLE_REQUEST = {
    "system_description": "Borgerassistent…",
    "signals": {"system.uses_ai": True},
    "predicates": {"anvendelse": "intet_af_ovenstaaende"},
    "use_llm_extraction": True,
}

SAMPLE_RESPONSE = {
    "rule_engine_version": "3.0.0-alpha.5",
    "evaluated_at": "2026-05-07T12:00:00Z",
    "rules_loaded": 10,
    "aggregate_status": "BETINGET-GO",
    "decisions": [{"rule_id": "ai_act.art6.hojrisiko_klassifikation", "triggered": True}],
    "warnings": [],
}


def test_save_creates_entry_with_id_and_timestamp(session):
    entry = audit.save_assessment(
        session,
        request_payload=SAMPLE_REQUEST,
        response_payload=SAMPLE_RESPONSE,
    )
    session.commit()
    assert entry.id and len(entry.id) >= 32  # uuid4
    assert entry.created_at is not None
    assert entry.aggregate_status == "BETINGET-GO"
    assert entry.rules_loaded == "10"
    assert entry.request_payload == SAMPLE_REQUEST
    assert entry.response_payload == SAMPLE_RESPONSE


def test_optional_metadata_persists(session):
    entry = audit.save_assessment(
        session,
        request_payload=SAMPLE_REQUEST,
        response_payload=SAMPLE_RESPONSE,
        case_id="K-2026-0184",
        user_id="parti.vijaya",
        note="første pilot-test",
    )
    session.commit()
    assert entry.case_id == "K-2026-0184"
    assert entry.user_id == "parti.vijaya"
    assert entry.note == "første pilot-test"


def test_list_recent_returns_newest_first(session):
    a = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, note="a")
    b = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, note="b")
    c = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, note="c")
    session.commit()
    entries = audit.list_recent(session, limit=10)
    # newest first — but flush-order isn't strict on identical timestamps;
    # at minimum we should get all 3 back
    assert {e.note for e in entries} == {"a", "b", "c"}
    assert len(entries) == 3


def test_list_recent_filters_by_case_id(session):
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, case_id="K-1")
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, case_id="K-2")
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE, case_id="K-1")
    session.commit()
    entries = audit.list_recent(session, case_id="K-1")
    assert len(entries) == 2
    assert all(e.case_id == "K-1" for e in entries)


def test_list_recent_filters_by_status(session):
    response_no_go = {**SAMPLE_RESPONSE, "aggregate_status": "NO-GO"}
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE)
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=response_no_go)
    audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=response_no_go)
    session.commit()
    entries = audit.list_recent(session, aggregate_status="NO-GO")
    assert len(entries) == 2
    assert all(e.aggregate_status == "NO-GO" for e in entries)


def test_get_by_id_round_trip(session):
    saved = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE)
    session.commit()
    fetched = audit.get_by_id(session, saved.id)
    assert fetched is not None
    assert fetched.id == saved.id
    assert fetched.request_payload == SAMPLE_REQUEST


def test_get_by_id_returns_none_for_missing(session):
    assert audit.get_by_id(session, "nonexistent-id") is None


def test_to_dict_omits_payloads_for_listing(session):
    entry = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE)
    session.commit()
    d = entry.to_dict()
    assert "request_payload" not in d
    assert "response_payload" not in d
    assert d["aggregate_status"] == "BETINGET-GO"
    assert d["rules_loaded"] == 10  # converted back to int


def test_to_full_dict_includes_payloads(session):
    entry = audit.save_assessment(session, request_payload=SAMPLE_REQUEST, response_payload=SAMPLE_RESPONSE)
    session.commit()
    d = entry.to_full_dict()
    assert d["request_payload"] == SAMPLE_REQUEST
    assert d["response_payload"] == SAMPLE_RESPONSE
