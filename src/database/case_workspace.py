"""Durable workflow records used by the unified municipal case workspace.

The existing :mod:`src.database.cases` module owns the coarse case state
machine.  This module adds the decision material around that state machine:
version-pinned references, concrete measures and an explicit approval record.
None of the records overwrite an assessment snapshot.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Optional, cast

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Session, relationship

from src.database.cases import get_case
from src.database.connection import Base


REFERENCE_TYPES = {
    "legal_screening",
    "dpia_assessment",
    "ai_act_assessment",
    "fria_assessment",
    "export",
    "external_record",
}
ACTION_CATEGORIES = {
    "measure",
    "condition",
    "evidence",
    "reassessment",
    "follow_up",
    "other",
}
ACTION_STATUSES = {"open", "in_progress", "completed", "dismissed"}
ACTION_PRIORITIES = {"low", "medium", "high", "critical"}
APPROVAL_TYPES = {"case", "dpia", "ai_act", "fria", "deployment"}
APPROVAL_STATUSES = {
    "pending",
    "approved",
    "approved_with_conditions",
    "rejected",
    "changes_requested",
}
APPROVAL_DECISIONS = APPROVAL_STATUSES - {"pending"}


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


class CaseWorkspaceReference(Base):
    """Stable link from a case to an immutable assessment or export."""

    __tablename__ = "case_workspace_references"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reference_type = Column(String(32), nullable=False)
    reference_id = Column(String(128), nullable=False)
    title = Column(String(255), nullable=True)
    summary = Column(Text, nullable=True)
    source_version = Column(String(128), nullable=True)
    details = Column(JSON, nullable=True)
    created_by = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    case = relationship("Case")

    __table_args__ = (
        UniqueConstraint(
            "case_db_id",
            "reference_type",
            "reference_id",
            name="uq_case_workspace_reference",
        ),
        Index(
            "ix_workspace_reference_lookup",
            "reference_type",
            "reference_id",
        ),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "reference_type": self.reference_type,
            "reference_id": self.reference_id,
            "title": self.title,
            "summary": self.summary,
            "source_version": self.source_version,
            "details": self.details or {},
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CaseAction(Base):
    """A concrete measure, condition or evidence task owned by a person."""

    __tablename__ = "case_actions"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(32), nullable=False, default="measure")
    status = Column(String(32), nullable=False, default="open", index=True)
    priority = Column(String(16), nullable=False, default="medium", index=True)
    owner = Column(String(128), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    source_reference_type = Column(String(32), nullable=True)
    source_reference_id = Column(String(128), nullable=True)
    evidence_note = Column(Text, nullable=True)
    created_by = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )

    case = relationship("Case")

    __table_args__ = (
        Index("ix_case_action_board", "case_db_id", "status", "priority"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "status": self.status,
            "priority": self.priority,
            "owner": self.owner,
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "source_reference_type": self.source_reference_type,
            "source_reference_id": self.source_reference_id,
            "evidence_note": self.evidence_note,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class CaseApproval(Base):
    """One review request and its single, immutable final decision."""

    __tablename__ = "case_approvals"

    id = Column(String(36), primary_key=True, default=_uuid)
    case_db_id = Column(
        String(36),
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    approval_type = Column(String(32), nullable=False, default="case")
    subject_reference_type = Column(String(32), nullable=True)
    subject_reference_id = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="pending", index=True)
    requested_by = Column(String(128), nullable=False)
    requested_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    decided_by = Column(String(128), nullable=True)
    actor_oid = Column(String(128), nullable=True, index=True)
    auth_mode = Column(String(32), nullable=True)
    identity_assurance = Column(String(32), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=True)
    conditions = Column(JSON, nullable=True)
    decision_snapshot = Column(JSON, nullable=True)
    is_identity_verified = Column(Boolean, nullable=False, default=False)

    case = relationship("Case")

    __table_args__ = (
        Index("ix_case_approval_status", "case_db_id", "status", "requested_at"),
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "case_db_id": self.case_db_id,
            "approval_type": self.approval_type,
            "subject_reference_type": self.subject_reference_type,
            "subject_reference_id": self.subject_reference_id,
            "status": self.status,
            "requested_by": self.requested_by,
            "requested_at": (
                self.requested_at.isoformat() if self.requested_at else None
            ),
            "decided_by": self.decided_by,
            "actor_oid": self.actor_oid,
            "auth_mode": self.auth_mode,
            "identity_assurance": self.identity_assurance,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "reason": self.reason,
            "conditions": self.conditions or [],
            "decision_snapshot": self.decision_snapshot or {},
            "is_identity_verified": self.is_identity_verified,
        }


def add_workspace_reference(
    session: Session,
    *,
    case_db_id: str,
    reference_type: str,
    reference_id: str,
    title: Optional[str] = None,
    summary: Optional[str] = None,
    source_version: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    created_by: Optional[str] = None,
) -> CaseWorkspaceReference:
    """Idempotently add a version-aware reference to a case."""

    if get_case(session, case_db_id) is None:
        raise ValueError(f"case not found: {case_db_id}")
    if reference_type not in REFERENCE_TYPES:
        raise ValueError(f"invalid reference type: {reference_type}")
    if not (reference_id or "").strip():
        raise ValueError("reference_id is required")
    existing = (
        session.query(CaseWorkspaceReference)
        .filter(
            CaseWorkspaceReference.case_db_id == case_db_id,
            CaseWorkspaceReference.reference_type == reference_type,
            CaseWorkspaceReference.reference_id == reference_id.strip(),
        )
        .one_or_none()
    )
    if existing is not None:
        return existing
    reference = CaseWorkspaceReference(
        case_db_id=case_db_id,
        reference_type=reference_type,
        reference_id=reference_id.strip(),
        title=(title or "").strip() or None,
        summary=(summary or "").strip() or None,
        source_version=(source_version or "").strip() or None,
        details=details or {},
        created_by=(created_by or "").strip() or None,
    )
    session.add(reference)
    session.flush()
    return reference


def record_workspace_event(
    session: Session,
    *,
    case_db_id: str,
    event_type: str,
    title: str,
    target_type: str,
    target_id: str,
    before: dict[str, Any],
    after: dict[str, Any],
    actor: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_kind: str = "unknown",
    model: Optional[str] = None,
) -> CaseWorkspaceReference:
    """Append an authenticated workflow event without editing any snapshot."""
    if actor_kind not in {"human", "ai", "system", "unknown"}:
        raise ValueError("invalid actor kind")
    return add_workspace_reference(
        session,
        case_db_id=case_db_id,
        reference_type="external_record",
        reference_id=f"workflow-event:{_uuid()}",
        title=title[:255],
        created_by=actor,
        details={
            "workspace_event": {
                "event_type": event_type,
                "target_type": target_type,
                "target_id": target_id,
                "before": before,
                "after": after,
                "actor_id": actor_id,
                "actor_kind": actor_kind,
                "model": model,
            }
        },
    )


def update_assessment_owner(
    session: Session,
    *,
    case_db_id: str,
    reference_type: str,
    reference_id: str,
    owner: Optional[str],
    updated_by: str,
    actor_id: Optional[str] = None,
    actor_kind: str = "human",
    model: Optional[str] = None,
) -> CaseWorkspaceReference:
    """Caller verifies case ownership; only the workspace sidecar is mutable."""
    if reference_type not in {
        "dpia_assessment",
        "legal_screening",
        "ai_act_assessment",
        "fria_assessment",
    }:
        raise ValueError("invalid assessment type")
    reference = add_workspace_reference(
        session,
        case_db_id=case_db_id,
        reference_type=reference_type,
        reference_id=reference_id,
        details={"metadata_only": True},
    )
    details = dict(reference.details or {})
    metadata = dict(details.get("workspace_metadata") or {})
    normalized_owner = (owner or "").strip() or None
    if metadata.get("owner") == normalized_owner:
        return reference
    before = {"owner": metadata.get("owner")}
    metadata.update(
        {
            "owner": normalized_owner,
            "updated_by": updated_by,
            "updated_by_id": actor_id,
            "updated_by_kind": actor_kind,
            "updated_by_model": model,
            "updated_at": _now().isoformat(),
        }
    )
    details["workspace_metadata"] = metadata
    cast(Any, reference).details = details
    record_workspace_event(
        session,
        case_db_id=case_db_id,
        event_type="assessment_owner_changed",
        title="Vurderingens ejer ændret",
        target_type=reference_type,
        target_id=reference_id,
        before=before,
        after={"owner": normalized_owner},
        actor=updated_by,
        actor_id=actor_id,
        actor_kind=actor_kind,
        model=model,
    )
    session.flush()
    return reference


def list_workspace_references(
    session: Session,
    case_db_id: str,
    *,
    reference_type: Optional[str] = None,
) -> list[CaseWorkspaceReference]:
    query = session.query(CaseWorkspaceReference).filter(
        CaseWorkspaceReference.case_db_id == case_db_id
    )
    if reference_type:
        query = query.filter(CaseWorkspaceReference.reference_type == reference_type)
    return query.order_by(CaseWorkspaceReference.created_at.desc()).all()


def create_case_action(
    session: Session,
    *,
    case_db_id: str,
    title: str,
    description: Optional[str] = None,
    category: str = "measure",
    priority: str = "medium",
    owner: Optional[str] = None,
    due_at: Optional[datetime] = None,
    source_reference_type: Optional[str] = None,
    source_reference_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> CaseAction:
    if get_case(session, case_db_id) is None:
        raise ValueError(f"case not found: {case_db_id}")
    if len((title or "").strip()) < 3:
        raise ValueError("action title must be at least 3 characters")
    if category not in ACTION_CATEGORIES:
        raise ValueError(f"invalid action category: {category}")
    if priority not in ACTION_PRIORITIES:
        raise ValueError(f"invalid action priority: {priority}")
    action = CaseAction(
        case_db_id=case_db_id,
        title=title.strip(),
        description=(description or "").strip() or None,
        category=category,
        priority=priority,
        owner=(owner or "").strip() or None,
        due_at=due_at,
        source_reference_type=(source_reference_type or "").strip() or None,
        source_reference_id=(source_reference_id or "").strip() or None,
        created_by=(created_by or "").strip() or None,
    )
    session.add(action)
    session.flush()
    return action


def update_case_action(
    session: Session,
    action_id: str,
    *,
    status: Optional[str] = None,
    owner: Optional[str] = None,
    due_at: Optional[datetime] = None,
    due_at_supplied: bool = False,
    evidence_note: Optional[str] = None,
    updated_by: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_kind: str = "unknown",
    model: Optional[str] = None,
) -> CaseAction:
    action = session.get(CaseAction, action_id)
    if action is None:
        raise ValueError(f"case action not found: {action_id}")
    audited_fields = ("status", "owner", "due_at", "evidence_note", "completed_at")
    previous = action.to_dict()
    before = {key: previous[key] for key in audited_fields}
    if action.source_reference_type == "procurement_clarification":
        next_status = status if status is not None else action.status
        next_note = evidence_note if evidence_note is not None else action.evidence_note
        if (
            next_status in {"completed", "dismissed"}
            and len((next_note or "").strip()) < 20
        ):
            raise ValueError(
                "Afsluttede afklaringer kræver et dokumenteret svar på mindst 20 tegn."
            )
    if status is not None:
        if status not in ACTION_STATUSES:
            raise ValueError(f"invalid action status: {status}")
        if (
            status == "completed"
            and len((evidence_note or action.evidence_note or "").strip()) < 5
        ):
            raise ValueError("completed actions require an evidence note")
        if action.status != status:
            action.status = status
            action.completed_at = _now() if status == "completed" else None
    if owner is not None:
        action.owner = owner.strip() or None
    if due_at is not None or due_at_supplied:
        cast(Any, action).due_at = due_at
    if evidence_note is not None:
        action.evidence_note = evidence_note.strip() or None
    current = action.to_dict()
    after = {key: current[key] for key in audited_fields}
    changed_fields = [key for key in audited_fields if before[key] != after[key]]
    if changed_fields:
        action.updated_at = _now()
        record_workspace_event(
            session,
            case_db_id=str(action.case_db_id),
            event_type="measure_updated",
            title=f"Foranstaltning ændret: {action.title}",
            target_type="measure",
            target_id=str(action.id),
            before={key: before[key] for key in changed_fields},
            after={key: after[key] for key in changed_fields},
            actor=updated_by,
            actor_id=actor_id,
            actor_kind=actor_kind,
            model=model,
        )
    session.flush()
    return action


def list_case_actions(
    session: Session,
    case_db_id: str,
    *,
    status: Optional[str] = None,
) -> list[CaseAction]:
    query = session.query(CaseAction).filter(CaseAction.case_db_id == case_db_id)
    if status:
        query = query.filter(CaseAction.status == status)
    return query.order_by(CaseAction.created_at.desc()).all()


def request_case_approval(
    session: Session,
    *,
    case_db_id: str,
    requested_by: str,
    approval_type: str = "case",
    subject_reference_type: Optional[str] = None,
    subject_reference_id: Optional[str] = None,
    decision_snapshot: Optional[dict[str, Any]] = None,
) -> CaseApproval:
    if get_case(session, case_db_id) is None:
        raise ValueError(f"case not found: {case_db_id}")
    if approval_type not in APPROVAL_TYPES:
        raise ValueError(f"invalid approval type: {approval_type}")
    if len((requested_by or "").strip()) < 2:
        raise ValueError("requester is required")
    approval = CaseApproval(
        case_db_id=case_db_id,
        approval_type=approval_type,
        subject_reference_type=(subject_reference_type or "").strip() or None,
        subject_reference_id=(subject_reference_id or "").strip() or None,
        requested_by=requested_by.strip(),
        decision_snapshot=decision_snapshot or {},
    )
    session.add(approval)
    session.flush()
    return approval


def decide_case_approval(
    session: Session,
    approval_id: str,
    *,
    decision: str,
    decided_by: str,
    reason: str,
    conditions: Optional[list[str]] = None,
    is_identity_verified: bool = False,
    actor_oid: Optional[str] = None,
    auth_mode: Optional[str] = None,
    identity_assurance: Optional[str] = None,
) -> CaseApproval:
    approval = session.get(CaseApproval, approval_id)
    if approval is None:
        raise ValueError(f"case approval not found: {approval_id}")
    if approval.status != "pending":
        raise ValueError("approval has already been decided")
    if decision not in APPROVAL_DECISIONS:
        raise ValueError(f"invalid approval decision: {decision}")
    if len((decided_by or "").strip()) < 2:
        raise ValueError("decision maker is required")
    if len((reason or "").strip()) < 20:
        raise ValueError("approval reason must be at least 20 characters")
    normalized_conditions = [
        item.strip() for item in (conditions or []) if item.strip()
    ]
    if decision == "approved_with_conditions" and not normalized_conditions:
        raise ValueError("conditional approval requires at least one condition")
    if any(len(item) < 3 for item in normalized_conditions):
        raise ValueError("approval conditions must be at least 3 characters")
    approval.status = decision
    approval.decided_by = decided_by.strip()
    approval.actor_oid = (actor_oid or "").strip() or None
    approval.auth_mode = (auth_mode or "").strip() or None
    approval.identity_assurance = (identity_assurance or "").strip() or None
    approval.decided_at = _now()
    approval.reason = reason.strip()
    approval.conditions = normalized_conditions
    approval.is_identity_verified = bool(is_identity_verified)
    if decision == "approved_with_conditions":
        for condition in normalized_conditions:
            create_case_action(
                session,
                case_db_id=approval.case_db_id,
                title=condition[:255],
                description=(
                    "Vilkår fra den betingede godkendelse. Dokumentér opfyldelse "
                    "før sagen kan sættes i drift."
                ),
                category="condition",
                priority="high",
                owner=decided_by.strip(),
                source_reference_type="approval",
                source_reference_id=approval.id,
                created_by=decided_by.strip(),
            )
    session.flush()
    return approval


def list_case_approvals(session: Session, case_db_id: str) -> list[CaseApproval]:
    return (
        session.query(CaseApproval)
        .filter(CaseApproval.case_db_id == case_db_id)
        .order_by(CaseApproval.requested_at.desc())
        .all()
    )
