"""Audit-log for v3 rule engine assessments.

Every call to `/api/v3/assess` is persisted so auditors can:
  - reproduce the exact decision later (input is stored verbatim)
  - track which rules were active and their version (engine version + each
    rule's `sidst_verificeret` date is captured at evaluation time)
  - see whether the LLM was used and what signals it inferred

The model is intentionally append-only — assessments are never updated
or deleted from this log. Use a separate workflow for case-level edits.
"""

from __future__ import annotations

import uuid
from datetime import datetime, UTC
from typing import Any

from sqlalchemy import Column, DateTime, JSON, String, Text, Index
from sqlalchemy.orm import Session

from src.database.connection import Base


class V3AssessmentLog(Base):
    """Append-only log entry for one v3 rule engine evaluation."""

    __tablename__ = "v3_assessment_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    case_id = Column(String(64), nullable=True, index=True)
    user_id = Column(String(64), nullable=True, index=True)

    rule_engine_version = Column(String(32), nullable=False)
    aggregate_status = Column(String(16), nullable=False, index=True)
    rules_loaded = Column(String(8), nullable=False)  # stored as string for cross-DB compat

    # The full request and response bodies — JSON for queryability.
    request_payload = Column(JSON, nullable=False)
    response_payload = Column(JSON, nullable=False)

    # Free-form for client-supplied context (e.g. case title at time of run).
    note = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_v3_audit_created_status", "created_at", "aggregate_status"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "case_id": self.case_id,
            "user_id": self.user_id,
            "rule_engine_version": self.rule_engine_version,
            "aggregate_status": self.aggregate_status,
            "rules_loaded": int(self.rules_loaded) if self.rules_loaded else 0,
            "note": self.note,
        }

    def to_full_dict(self) -> dict[str, Any]:
        d = self.to_dict()
        d["request_payload"] = self.request_payload
        d["response_payload"] = self.response_payload
        return d


def save_assessment(
    session: Session,
    *,
    request_payload: dict[str, Any],
    response_payload: dict[str, Any],
    case_id: str | None = None,
    user_id: str | None = None,
    note: str | None = None,
) -> V3AssessmentLog:
    """Persist one assessment. Caller manages the SQLAlchemy session."""
    entry = V3AssessmentLog(
        case_id=case_id,
        user_id=user_id,
        rule_engine_version=str(response_payload.get("rule_engine_version", "unknown")),
        aggregate_status=str(response_payload.get("aggregate_status", "unknown")),
        rules_loaded=str(response_payload.get("rules_loaded", 0)),
        request_payload=request_payload,
        response_payload=response_payload,
        note=note,
    )
    session.add(entry)
    session.flush()  # populate the auto-generated id without committing
    return entry


def list_recent(
    session: Session,
    *,
    limit: int = 50,
    case_id: str | None = None,
    aggregate_status: str | None = None,
) -> list[V3AssessmentLog]:
    """Return up to `limit` most-recent log entries, newest first."""
    query = session.query(V3AssessmentLog).order_by(V3AssessmentLog.created_at.desc())
    if case_id:
        query = query.filter(V3AssessmentLog.case_id == case_id)
    if aggregate_status:
        query = query.filter(V3AssessmentLog.aggregate_status == aggregate_status)
    return query.limit(limit).all()


def get_by_id(session: Session, log_id: str) -> V3AssessmentLog | None:
    return session.query(V3AssessmentLog).filter(V3AssessmentLog.id == log_id).one_or_none()
