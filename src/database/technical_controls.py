"""Human follow-up, kept separate from immutable AI/JEV snapshots."""

from datetime import UTC, datetime
from uuid import uuid4
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from src.database.connection import Base


class TechnicalControlPoint(Base):
    __tablename__ = "technical_control_points"
    __table_args__ = (
        UniqueConstraint(
            "case_db_id",
            "assessment_id",
            "original_check_id",
            name="uq_human_original_control",
        ),
    )
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    case_db_id = Column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    assessment_id = Column(
        String(36), ForeignKey("dpia_assessments.id"), nullable=False, index=True
    )
    original_check_id = Column(String(200), nullable=True)
    question = Column(Text, nullable=False)
    notes = Column(Text, nullable=False, default="")
    owner = Column(String(200), nullable=False, default="")
    status = Column(String(24), nullable=False, default="open")
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class TechnicalControlPointRevision(Base):
    """Append-only full human snapshot and authenticated actor per mutation."""

    __tablename__ = "technical_control_point_revisions"
    __table_args__ = (
        UniqueConstraint(
            "control_point_id", "version", name="uq_human_control_revision"
        ),
    )
    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    control_point_id = Column(
        String(36),
        ForeignKey("technical_control_points.id"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, nullable=False)
    action = Column(String(24), nullable=False)
    snapshot = Column(JSON, nullable=False)
    actor_id = Column(String(128), nullable=False)
    actor_name = Column(String(255), nullable=False)
    identity_assurance = Column(String(40), nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
