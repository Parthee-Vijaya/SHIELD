"""Detect legal-source changes and turn them into case reassessments."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from src.database.cases import Case, get_case
from src.database.legal_monitoring import (
    CaseLegalDependency,
    CaseReassessment,
    LegalSourceVersion,
    MonitoredLegalSource,
)


_SHA256 = re.compile(r"^[a-fA-F0-9]{64}$")
REASSESSMENT_STATUSES = {"open", "in_progress", "completed", "dismissed"}


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class LegalSourceChangeResult:
    source: MonitoredLegalSource
    version: LegalSourceVersion
    changed: bool
    first_seen: bool
    reassessments: list[CaseReassessment]

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source.to_dict(),
            "version": self.version.to_dict(),
            "changed": self.changed,
            "first_seen": self.first_seen,
            "affected_case_count": len(
                {item.case_db_id for item in self.reassessments}
            ),
            "reassessments": [item.to_dict() for item in self.reassessments],
        }


def _normalize_sha256(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not _SHA256.fullmatch(normalized):
        raise ValueError("content_sha256 must contain 64 hexadecimal characters")
    return normalized


def register_legal_source_version(
    session: Session,
    *,
    source_key: str,
    title: str,
    authority: str,
    source_url: str,
    content_sha256: str,
    version_identifier: Optional[str] = None,
    jurisdiction: str = "DK",
    effective_at: Optional[datetime] = None,
    checked_at: Optional[datetime] = None,
    change_summary: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    reassessment_due_days: int = 30,
) -> LegalSourceChangeResult:
    """Upsert a source observation and create reviews for every dependency.

    The first observation establishes a baseline and never creates an alert.
    Re-observing the same checksum is idempotent.  A different checksum creates
    one reassessment per active dependency and pins it to the new version.
    """

    normalized_key = (source_key or "").strip()
    if not normalized_key:
        raise ValueError("source_key is required")
    if len((title or "").strip()) < 3:
        raise ValueError("legal source title is required")
    if len((authority or "").strip()) < 2:
        raise ValueError("legal source authority is required")
    if not (source_url or "").strip().startswith(("https://", "http://")):
        raise ValueError("legal source URL must be an HTTP(S) URL")
    if reassessment_due_days < 1:
        raise ValueError("reassessment_due_days must be positive")
    checksum = _normalize_sha256(content_sha256)
    observed_at = checked_at or _now()

    source = (
        session.query(MonitoredLegalSource)
        .filter(MonitoredLegalSource.source_key == normalized_key)
        .one_or_none()
    )
    if source is None:
        source = MonitoredLegalSource(
            source_key=normalized_key,
            title=title.strip(),
            authority=authority.strip(),
            jurisdiction=(jurisdiction or "DK").strip(),
            source_url=source_url.strip(),
            current_version_identifier=(version_identifier or "").strip() or None,
            current_content_sha256=checksum,
            effective_at=effective_at,
            last_checked_at=observed_at,
            source_metadata=metadata or {},
        )
        session.add(source)
        session.flush()
        version = LegalSourceVersion(
            legal_source_id=source.id,
            version_identifier=(version_identifier or "").strip() or None,
            content_sha256=checksum,
            effective_at=effective_at,
            detected_at=observed_at,
            change_summary=(change_summary or "").strip()
            or "Første observerede version",
            source_metadata=metadata or {},
        )
        session.add(version)
        session.flush()
        return LegalSourceChangeResult(source, version, False, True, [])

    previous_checksum = source.current_content_sha256
    changed = previous_checksum != checksum
    source.title = title.strip()
    source.authority = authority.strip()
    source.jurisdiction = (jurisdiction or source.jurisdiction).strip()
    source.source_url = source_url.strip()
    source.last_checked_at = observed_at
    source.source_metadata = metadata or source.source_metadata or {}

    version = (
        session.query(LegalSourceVersion)
        .filter(
            LegalSourceVersion.legal_source_id == source.id,
            LegalSourceVersion.content_sha256 == checksum,
        )
        .one_or_none()
    )
    if version is None:
        version = LegalSourceVersion(
            legal_source_id=source.id,
            version_identifier=(version_identifier or "").strip() or None,
            content_sha256=checksum,
            effective_at=effective_at,
            detected_at=observed_at,
            change_summary=(change_summary or "").strip() or None,
            source_metadata=metadata or {},
        )
        session.add(version)
        session.flush()

    if not changed:
        source.updated_at = observed_at
        session.flush()
        return LegalSourceChangeResult(source, version, False, False, [])

    previous_version = (
        session.query(LegalSourceVersion)
        .filter(
            LegalSourceVersion.legal_source_id == source.id,
            LegalSourceVersion.content_sha256 == previous_checksum,
        )
        .order_by(LegalSourceVersion.detected_at.desc())
        .first()
    )
    if previous_version is None:
        raise ValueError("current legal source version is missing from version history")

    source.current_content_sha256 = checksum
    source.current_version_identifier = (version_identifier or "").strip() or None
    source.effective_at = effective_at
    source.updated_at = observed_at
    due_at = observed_at + timedelta(days=reassessment_due_days)
    reassessments: list[CaseReassessment] = []
    dependencies = (
        session.query(CaseLegalDependency)
        .filter(
            CaseLegalDependency.legal_source_id == source.id,
            CaseLegalDependency.status == "active",
            CaseLegalDependency.last_reviewed_version_id != version.id,
        )
        .all()
    )
    for dependency in dependencies:
        existing = (
            session.query(CaseReassessment)
            .filter(
                CaseReassessment.dependency_id == dependency.id,
                CaseReassessment.new_version_id == version.id,
            )
            .one_or_none()
        )
        if existing is not None:
            reassessments.append(existing)
            continue
        article = (
            f" ({dependency.article_reference})" if dependency.article_reference else ""
        )
        reason = (
            change_summary or ""
        ).strip() or f"{source.title}{article} har fået en ny observeret version."
        reassessment = CaseReassessment(
            case_db_id=dependency.case_db_id,
            dependency_id=dependency.id,
            legal_source_id=source.id,
            previous_version_id=dependency.last_reviewed_version_id,
            new_version_id=version.id,
            reason=reason,
            assigned_to=dependency.case.assigned_to if dependency.case else None,
            due_at=due_at,
            created_at=observed_at,
        )
        session.add(reassessment)
        reassessments.append(reassessment)
        case = session.get(Case, dependency.case_db_id)
        if case is not None:
            # A legal change makes review due now; it does not by itself prove
            # that a previously approved decision is invalid.
            case.next_review_at = observed_at
            case.updated_at = observed_at
    session.flush()
    return LegalSourceChangeResult(source, version, True, False, reassessments)


def link_case_to_legal_source(
    session: Session,
    *,
    case_db_id: str,
    source_id: str,
    article_reference: Optional[str] = None,
    relevance: Optional[str] = None,
    assessment_reference_type: Optional[str] = None,
    assessment_reference_id: Optional[str] = None,
    linked_by: Optional[str] = None,
) -> CaseLegalDependency:
    case = get_case(session, case_db_id)
    if case is None:
        raise ValueError(f"case not found: {case_db_id}")
    source = session.get(MonitoredLegalSource, source_id)
    if source is None:
        raise ValueError(f"legal source not found: {source_id}")
    current_version = (
        session.query(LegalSourceVersion)
        .filter(
            LegalSourceVersion.legal_source_id == source.id,
            LegalSourceVersion.content_sha256 == source.current_content_sha256,
        )
        .order_by(LegalSourceVersion.detected_at.desc())
        .first()
    )
    if current_version is None:
        raise ValueError("legal source has no current version snapshot")
    normalized_article = (article_reference or "").strip()
    existing = (
        session.query(CaseLegalDependency)
        .filter(
            CaseLegalDependency.case_db_id == case_db_id,
            CaseLegalDependency.legal_source_id == source_id,
            CaseLegalDependency.article_reference == normalized_article,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.status != "active":
            existing.status = "active"
        return existing
    dependency = CaseLegalDependency(
        case_db_id=case_db_id,
        legal_source_id=source_id,
        article_reference=normalized_article,
        relevance=(relevance or "").strip() or None,
        assessment_reference_type=(assessment_reference_type or "").strip() or None,
        assessment_reference_id=(assessment_reference_id or "").strip() or None,
        linked_source_version_id=current_version.id,
        last_reviewed_version_id=current_version.id,
        last_reviewed_at=_now(),
        linked_by=(linked_by or "").strip() or None,
    )
    session.add(dependency)
    session.flush()
    return dependency


def list_case_legal_dependencies(
    session: Session, case_db_id: str, *, active_only: bool = True
) -> list[CaseLegalDependency]:
    query = session.query(CaseLegalDependency).filter(
        CaseLegalDependency.case_db_id == case_db_id
    )
    if active_only:
        query = query.filter(CaseLegalDependency.status == "active")
    return query.order_by(CaseLegalDependency.linked_at.desc()).all()


def list_reassessments(
    session: Session,
    *,
    case_db_id: Optional[str] = None,
    status: Optional[str] = None,
    source_id: Optional[str] = None,
    limit: int = 200,
) -> list[CaseReassessment]:
    query = session.query(CaseReassessment)
    if case_db_id:
        query = query.filter(CaseReassessment.case_db_id == case_db_id)
    if status:
        if status not in REASSESSMENT_STATUSES:
            raise ValueError(f"invalid reassessment status: {status}")
        query = query.filter(CaseReassessment.status == status)
    if source_id:
        query = query.filter(CaseReassessment.legal_source_id == source_id)
    return query.order_by(CaseReassessment.created_at.desc()).limit(limit).all()


def update_reassessment(
    session: Session,
    reassessment_id: str,
    *,
    status: str,
    assigned_to: Optional[str] = None,
    resolved_by: Optional[str] = None,
    resolution_note: Optional[str] = None,
) -> CaseReassessment:
    reassessment = session.get(CaseReassessment, reassessment_id)
    if reassessment is None:
        raise ValueError(f"reassessment not found: {reassessment_id}")
    if status not in REASSESSMENT_STATUSES:
        raise ValueError(f"invalid reassessment status: {status}")
    if reassessment.status in {"completed", "dismissed"}:
        raise ValueError("reassessment has already been resolved")
    if status in {"completed", "dismissed"}:
        if len((resolved_by or "").strip()) < 2:
            raise ValueError("resolver is required")
        if len((resolution_note or "").strip()) < 20:
            raise ValueError("resolution note must be at least 20 characters")
        reassessment.resolved_by = resolved_by.strip()
        reassessment.resolution_note = resolution_note.strip()
        reassessment.resolved_at = _now()
        dependency = reassessment.dependency
        dependency.last_reviewed_version_id = reassessment.new_version_id
        dependency.last_reviewed_at = reassessment.resolved_at
    if assigned_to is not None:
        reassessment.assigned_to = assigned_to.strip() or None
    reassessment.status = status
    session.flush()
    return reassessment
