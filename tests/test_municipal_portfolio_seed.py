from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.cli.seed_municipal_portfolio import ACTOR, seed_municipal_portfolio
from src.database.case_workspace import CaseAction, CaseApproval, CaseWorkspaceReference
from src.database.cases import Case
from src.database.connection import Base
from src.database.document_bank import (
    CaseDocumentLink,
    MunicipalDocument,
    MunicipalDocumentVersion,
)
from src.database.dpia import DPIAAssessmentRecord
from src.rule_engine.audit import V3AssessmentLog
from src.services.case_workspace_service import build_case_workspace


def _session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def test_portfolio_is_complete_and_idempotent(tmp_path):
    factory = _session_factory()
    session = factory()
    storage_root = tmp_path / "document-bank"

    first = seed_municipal_portfolio(session, storage_root=storage_root)
    session.commit()
    first_counts = {
        "cases": session.query(Case).count(),
        "dpia": session.query(DPIAAssessmentRecord).count(),
        "legal": session.query(V3AssessmentLog).count(),
        "references": session.query(CaseWorkspaceReference).count(),
        "actions": session.query(CaseAction).count(),
        "approvals": session.query(CaseApproval).count(),
        "documents": session.query(MunicipalDocument).count(),
        "versions": session.query(MunicipalDocumentVersion).count(),
        "links": session.query(CaseDocumentLink).count(),
    }

    second = seed_municipal_portfolio(session, storage_root=storage_root)
    session.commit()
    second_counts = {
        "cases": session.query(Case).count(),
        "dpia": session.query(DPIAAssessmentRecord).count(),
        "legal": session.query(V3AssessmentLog).count(),
        "references": session.query(CaseWorkspaceReference).count(),
        "actions": session.query(CaseAction).count(),
        "approvals": session.query(CaseApproval).count(),
        "documents": session.query(MunicipalDocument).count(),
        "versions": session.query(MunicipalDocumentVersion).count(),
        "links": session.query(CaseDocumentLink).count(),
    }

    assert first["case_count"] == second["case_count"] == 3
    assert first_counts == second_counts
    assert first_counts["cases"] == 3
    assert first_counts["dpia"] == 3
    assert first_counts["legal"] == 3
    assert first_counts["documents"] == first_counts["versions"] == 5
    assert first_counts["links"] == 9
    assert len(list(storage_root.rglob("*.txt"))) == 5

    cases = {item.case_id: item for item in session.query(Case).all()}
    assert {item.status for item in cases.values()} == {
        "idriftsat",
        "vurderet",
        "remediation",
    }
    assert all(item.assigned_to == ACTOR for item in cases.values())

    live = build_case_workspace(session, cases["KAL-AI-2026-014"].id)
    pending = build_case_workspace(session, cases["KAL-AI-2026-021"].id)
    remediation = build_case_workspace(session, cases["KAL-AI-2026-027"].id)
    assert live["case"]["last_aggregate_status"] == "GO"
    assert len(live["assessments"]["dpia"]) == 1
    assert len(live["assessments"]["ai_act"]) == 1
    assert len(live["assessments"]["fria"]) == 1
    assert len(live["documents"]) == 3
    assert pending["readiness"]["pending_approval_count"] == 1
    assert pending["readiness"]["can_approve"] is True
    assert remediation["readiness"]["blocking_measure_count"] >= 2
    assert remediation["case"]["last_aggregate_status"] == "BETINGET-GO"
    assert all(
        approval.is_identity_verified is False
        for approval in session.query(CaseApproval).all()
    )

    visible_titles = [item.title for item in cases.values()]
    visible_titles += [item.title for item in session.query(MunicipalDocument).all()]
    assert not any("demo" in title.casefold() for title in visible_titles)
    assert not any("testdata" in title.casefold() for title in visible_titles)

    session.close()
