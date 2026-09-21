"""Municipal procurement profiles and immutable, evidence-bound AI analyses."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String

from src.database.connection import Base


def utc_iso(value):
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


class ProcurementProfile(Base):
    __tablename__ = "procurement_profiles"

    case_id = Column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True
    )
    payload = Column(JSON, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def to_dict(self):
        return {**self.payload, "case_id": self.case_id, "revision": self.revision}


class ProcurementAnalysis(Base):
    __tablename__ = "procurement_analyses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    profile_fingerprint = Column(String(64), nullable=False)
    source_fingerprint = Column(String(64), nullable=False)
    generation_payload = Column(JSON, nullable=False)
    model = Column(String(160), nullable=False)
    generation_provider = Column(String(64), nullable=False)
    status = Column(String(40), nullable=False, default="requires_human_review")

    def to_dict(self):
        return {
            **self.generation_payload,
            "id": self.id,
            "case_id": self.case_id,
            "created_at": utc_iso(self.created_at),
            "model": self.model,
            "generation_provider": self.generation_provider,
            "status": self.status,
            "profile_fingerprint": self.profile_fingerprint,
            "source_fingerprint": self.source_fingerprint,
        }


class ProcurementFactReview(Base):
    """User confirmation of extracted facts, never a legal approval."""

    __tablename__ = "procurement_fact_reviews"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analysis_id = Column(
        String(36), ForeignKey("procurement_analyses.id"), nullable=False, index=True
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    reviewed_by = Column(String(200), nullable=False)
    payload = Column(JSON, nullable=False)

    def to_dict(self):
        return {
            **self.payload,
            "id": self.id,
            "case_id": self.case_id,
            "analysis_id": self.analysis_id,
            "created_at": utc_iso(self.created_at),
            "reviewed_by": self.reviewed_by,
        }
