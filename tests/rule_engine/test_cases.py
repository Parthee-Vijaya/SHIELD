"""Tests for the case workflow state-machine (M2).

Covers create → list → transition → attach_assessment + auto-transition logic.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.connection import Base
from src.rule_engine import audit  # noqa: F401 — registers V3AssessmentLog
from src.database import cases as v3_cases


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


class TestCaseCreate:
    def test_creates_with_default_kladde_status(self, session):
        case = v3_cases.create_case(
            session,
            case_id="K-2026-0001",
            title="Test sag",
        )
        assert case.id is not None
        assert case.case_id == "K-2026-0001"
        assert case.status == "kladde"
        assert case.last_aggregate_status is None
        assert case.created_at is not None

    def test_creates_with_initial_transition_entry(self, session):
        case = v3_cases.create_case(
            session, case_id="K-1", title="Initial transition test",
        )
        assert len(case.transitions) == 1
        t = case.transitions[0]
        assert t.from_status is None
        assert t.to_status == "kladde"
        assert "oprettet" in (t.note or "").lower()

    def test_invalid_status_raises(self, session):
        with pytest.raises(ValueError, match="invalid status"):
            v3_cases.create_case(
                session, case_id="K-x", title="bad", status="not-a-status",
            )

    def test_cannot_bypass_workflow_with_explicit_initial_status(self, session):
        with pytest.raises(ValueError, match="oprettes som kladde"):
            v3_cases.create_case(
                session, case_id="K-2", title="t",
                status="vurderet",
                last_aggregate_status="GO",
            )


class TestCaseTransition:
    def test_moves_status_and_records_audit_trail(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.transition_case(session, case.id, "vurderet", note="moved by test")
        assert case.status == "vurderet"
        assert len(case.transitions) == 2
        last = case.transitions[-1]
        assert last.from_status == "kladde"
        assert last.to_status == "vurderet"
        assert last.note == "moved by test"

    def test_no_op_when_already_in_status(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.transition_case(session, case.id, "kladde")
        # No new transition row beyond the initial one
        assert len(case.transitions) == 1

    def test_invalid_target_status_raises(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        with pytest.raises(ValueError, match="invalid status"):
            v3_cases.transition_case(session, case.id, "bogus")

    def test_unknown_case_id_raises(self, session):
        with pytest.raises(ValueError, match="case not found"):
            v3_cases.transition_case(session, "no-such-id", "vurderet")

    def test_rejects_skipping_directly_from_draft_to_deployment(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        with pytest.raises(ValueError, match="ikke tilladt"):
            v3_cases.transition_case(session, case.id, "idriftsat")

    def test_approval_requires_current_go_assessment_and_documented_decision(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.attach_assessment(session, case.id, "log-1", "GO")

        with pytest.raises(ValueError, match="bekræftes"):
            v3_cases.transition_case(session, case.id, "godkendt")
        with pytest.raises(ValueError, match="beslutningstager"):
            v3_cases.transition_case(
                session,
                case.id,
                "godkendt",
                confirmed=True,
                note="Grundlaget er gennemgået og kan godkendes.",
            )
        with pytest.raises(ValueError, match="mindst 20 tegn"):
            v3_cases.transition_case(
                session,
                case.id,
                "godkendt",
                confirmed=True,
                changed_by="PV",
                note="For kort",
            )

        v3_cases.transition_case(
            session,
            case.id,
            "godkendt",
            confirmed=True,
            changed_by="PV",
            note="Vurdering, hjemmel og restrisici er gennemgået.",
        )
        assert case.status == "godkendt"
        assert case.transitions[-1].changed_by == "PV"

    def test_betinget_assessment_cannot_be_approved(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.attach_assessment(session, case.id, "log-1", "BETINGET-GO")
        with pytest.raises(ValueError, match="uden blokeringer"):
            v3_cases.transition_case(
                session,
                case.id,
                "godkendt",
                confirmed=True,
                changed_by="PV",
                note="Sagen ønskes godkendt trods uafklarede forhold.",
            )


class TestListAndGet:
    def test_list_returns_newest_first(self, session):
        a = v3_cases.create_case(session, case_id="K-A", title="a")
        b = v3_cases.create_case(session, case_id="K-B", title="b")
        # Update b so it bubbles to top
        v3_cases.transition_case(session, b.id, "vurderet")
        items = v3_cases.list_cases(session)
        assert items[0].id == b.id
        assert items[-1].id == a.id

    def test_filter_by_status(self, session):
        a = v3_cases.create_case(session, case_id="K-A", title="a")
        b = v3_cases.create_case(session, case_id="K-B", title="b")
        v3_cases.transition_case(session, a.id, "vurderet")
        items = v3_cases.list_cases(session, status="vurderet")
        assert len(items) == 1
        assert items[0].id == a.id

    def test_filter_by_case_id(self, session):
        v3_cases.create_case(session, case_id="K-A", title="a")
        v3_cases.create_case(session, case_id="K-B", title="b")
        items = v3_cases.list_cases(session, case_id="K-A")
        assert len(items) == 1
        assert items[0].case_id == "K-A"


class TestAttachAssessment:
    def test_kladde_auto_transitions_to_vurderet(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.attach_assessment(
            session, case.id, "log-uuid-1", "GO",
        )
        assert case.status == "vurderet"
        assert case.last_assessment_log_id == "log-uuid-1"
        assert case.last_aggregate_status == "GO"

    def test_vurderet_auto_transitions_to_remediation_on_betinget_go(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.attach_assessment(session, case.id, "log-1", "GO")
        # Now case is vurderet — second attach with BETINGET-GO should suggest remediation
        v3_cases.attach_assessment(session, case.id, "log-2", "BETINGET-GO")
        assert case.status == "remediation"
        assert case.last_assessment_log_id == "log-2"

    def test_new_blocking_assessment_reopens_approved_case(self, session):
        case = v3_cases.create_case(session, case_id="K-1", title="t")
        v3_cases.attach_assessment(session, case.id, "log-0", "GO")
        v3_cases.transition_case(
            session,
            case.id,
            "godkendt",
            confirmed=True,
            changed_by="PV",
            note="Vurdering, lovgrundlag og restrisici er gennemgået.",
        )
        v3_cases.attach_assessment(session, case.id, "log-1", "BETINGET-GO")
        assert case.status == "remediation"
        assert "genåbner" in (case.transitions[-1].note or "")
