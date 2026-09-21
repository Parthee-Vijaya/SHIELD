"""Relational records for legal-source dependencies and reassessments.

The legal text itself may live in Retsinformation, EUR-Lex or the search
index.  These tables retain only the provenance needed to answer two audit
questions: which source/version did a case rely on, and which cases need a
new review after that source changes?
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from src.database.cases import Case  # noqa: F401 - registers FK target
from src.database.connection import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


class MonitoredLegalSource(Base):
    """Stable identity and latest-known state of an authoritative source."""

    __tablename__ = "monitored_legal_sources"

    id = Column(String(36), primary_key=True, default=_uuid)
    source_key = Column(String(255), nullable=False, unique=True, index=True)
    title = Column(String(500), nullable=False)
    authority = Column(String(255), nullable=False)
    jurisdiction = Column(String(64), nullable=False, default="DK")
    source_url = Column(Text, nullable=False)
    current_version_identifier = Column(String(128), nullable=True)
    current_content_sha256 = Column(String(64), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    source_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    versions = relationship(
        "LegalSourceVersion",
        back_populates="source",
        cascade="all, delete-orphan",
        order_by="LegalSourceVersion.detected_at",
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_key": self.source_key,
            "title": self.title,
            "authority": self.authority,
            "jurisdiction": self.jurisdiction,
            "source_url": self.source_url,
            "current_version_identifier": self.current_version_identifier,
            "current_content_sha256": self.current_content_sha256,
            "effective_at": (
                self.effective_at.isoformat() if self.effective_at else None
            ),
            "last_checked_at": (
                self.last_checked_at.isoformat() if self.last_checked_at else None
            ),
            "source_metadata": self.source_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class LegalSourceVersion(Base):
    """Immutable observed version of a monitored legal source."""

    __tablename__ = "legal_source_versions"

    id = Column(String(36), primary_key=True, default=_uuid)
    legal_source_id = Column(
        String(36),
        ForeignKey("monitored_legal_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_identifier = Column(String(128), nullable=True)
    content_sha256 = Column(String(64), nullable=False)
    effective_at = Column(DateTime(timezone=True), nullable=True)
    detected_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    change_summary = Column(Text, nullable=True)
    source_metadata = Column(JSON, nullable=True)

    source = relationship("MonitoredLegalSource", back_populates="versions")

    __table_args__ = (
        UniqueConstraint(
            "legal_source_id", "content_sha256", name="uq_legal_source_content"
        ),
        Index("ix_legal_source_version_detected", "legal_source_id", "detected_at"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "legal_source_id": self.legal_source_id,
            "version_identifier": self.version_identifier,
            "content_sha256": self.content_sha256,
            "effective_at": (
                self.effective_at.isoformat() if self.effective_at else None
            ),
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "change_summary": self.change_summary,
            "source_metadata": self.source_metadata or {},
        }


class CaseLegalDependency(Base):
    """A case's declared reliance on a legal source or provision."""

    __tablename__ = "case_legal_dependencies"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    legal_source_id = Column(
        String(36),
        ForeignKey("monitored_legal_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    article_reference = Column(String(255), nullable=False, default="")
    relevance = Column(Text, nullable=True)
    assessment_reference_type = Column(String(32), nullable=True)
    assessment_reference_id = Column(String(128), nullable=True)
    linked_source_version_id = Column(
        String(36), ForeignKey("legal_source_versions.id"), nullable=False
    )
    last_reviewed_version_id = Column(
        String(36), ForeignKey("legal_source_versions.id"), nullable=False
    )
    last_reviewed_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    status = Column(String(16), nullable=False, default="active", index=True)
    linked_by = Column(String(128), nullable=True)
    linked_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    case = relationship("Case")
    legal_source = relationship("MonitoredLegalSource")
    linked_source_version = relationship(
        "LegalSourceVersion", foreign_keys=[linked_source_version_id]
    )
    last_reviewed_version = relationship(
        "LegalSourceVersion", foreign_keys=[last_reviewed_version_id]
    )

    __table_args__ = (
        UniqueConstraint(
            "case_db_id",
            "legal_source_id",
            "article_reference",
            name="uq_case_legal_dependency",
        ),
        Index("ix_case_legal_dependency_status", "case_db_id", "status"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "legal_source_id": self.legal_source_id,
            "source": self.legal_source.to_dict() if self.legal_source else None,
            "article_reference": self.article_reference,
            "relevance": self.relevance,
            "assessment_reference_type": self.assessment_reference_type,
            "assessment_reference_id": self.assessment_reference_id,
            "linked_source_version_id": self.linked_source_version_id,
            "last_reviewed_version_id": self.last_reviewed_version_id,
            "last_reviewed_at": (
                self.last_reviewed_at.isoformat() if self.last_reviewed_at else None
            ),
            "status": self.status,
            "linked_by": self.linked_by,
            "linked_at": self.linked_at.isoformat() if self.linked_at else None,
        }


class CaseReassessment(Base):
    """Actionable review generated by a changed legal source."""

    __tablename__ = "case_reassessments"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dependency_id = Column(
        String(36),
        ForeignKey("case_legal_dependencies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    legal_source_id = Column(
        String(36),
        ForeignKey("monitored_legal_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_version_id = Column(
        String(36), ForeignKey("legal_source_versions.id"), nullable=False
    )
    new_version_id = Column(
        String(36), ForeignKey("legal_source_versions.id"), nullable=False
    )
    trigger_type = Column(String(32), nullable=False, default="law_change")
    status = Column(String(24), nullable=False, default="open", index=True)
    reason = Column(Text, nullable=False)
    assigned_to = Column(String(128), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String(128), nullable=True)
    resolution_note = Column(Text, nullable=True)

    case = relationship("Case")
    dependency = relationship("CaseLegalDependency")
    legal_source = relationship("MonitoredLegalSource")
    previous_version = relationship(
        "LegalSourceVersion", foreign_keys=[previous_version_id]
    )
    new_version = relationship("LegalSourceVersion", foreign_keys=[new_version_id])

    __table_args__ = (
        UniqueConstraint(
            "dependency_id", "new_version_id", name="uq_dependency_reassessment"
        ),
        Index("ix_case_reassessment_queue", "status", "due_at", "created_at"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "dependency_id": self.dependency_id,
            "legal_source_id": self.legal_source_id,
            "source": self.legal_source.to_dict() if self.legal_source else None,
            "previous_version_id": self.previous_version_id,
            "new_version_id": self.new_version_id,
            "trigger_type": self.trigger_type,
            "status": self.status,
            "reason": self.reason,
            "assigned_to": self.assigned_to,
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolved_by": self.resolved_by,
            "resolution_note": self.resolution_note,
        }
