"""Case-linked AI Act and fundamental-rights assessment endpoints.

Both assessment engines are deterministic and side-effect free.  This router
adds the HTTP, authorization and persistence boundary: the submitted case is
resolved unambiguously, the complete request/result pair is retained as one
immutable workspace reference, and resulting work is copied to the case action
board in the same database transaction.
"""

from __future__ import annotations

from datetime import UTC, datetime, time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, require_roles
from src.database.case_workspace import (
    CaseAction,
    add_workspace_reference,
    create_case_action,
    update_case_action,
)
from src.database.cases import Case
from src.database.connection import get_db
from src.services.ai_act_assessment import (
    AIActAssessmentRequest,
    AIActAssessmentResponse,
    assess_ai_act,
)
from src.services.fria_assessment import (
    FRIAAssessmentRequest,
    FRIAAssessmentResponse,
    assess_fria,
)


router = APIRouter(tags=["case-assessment-tracks"])

ASSESSMENT_ACCESS = require_roles(
    "Hammeren.Sagsbehandler",
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
)


def _resolve_case(session: Session, supplied_case_id: str) -> Case:
    """Resolve an internal UUID first, then one unique municipal case ID."""

    direct = session.query(Case).filter(Case.id == supplied_case_id).one_or_none()
    if direct is not None:
        return direct

    external_matches = (
        session.query(Case)
        .filter(Case.case_id == supplied_case_id)
        .order_by(Case.created_at.desc())
        .limit(2)
        .all()
    )
    if not external_matches:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Sagen findes ikke. Brug sagens interne id eller et eksisterende "
                "kommunalt sags-id."
            ),
        )
    if len(external_matches) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Det kommunale sags-id matcher flere sager. Åbn den ønskede sag "
                "og brug dens interne id."
            ),
        )
    return external_matches[0]


def _actor_snapshot(user: UserPrincipal) -> dict[str, Any]:
    return {
        "oid": user.oid,
        "name": user.name,
        "roles": list(user.roles),
        "auth_mode": user.auth_mode,
        "identity_assurance": user.identity_assurance,
    }


def _action_title(prefix: str, text_value: str) -> str:
    """Return a readable action title that fits the database column."""

    compact = " ".join(text_value.split())
    available = 255 - len(prefix)
    if len(compact) <= available:
        return prefix + compact
    return prefix + compact[: max(1, available - 1)].rstrip() + "…"


def _actor_name(user: UserPrincipal) -> str:
    """Fit display identity into legacy workflow actor columns."""

    return user.name[:128]


def _ensure_action(
    session: Session,
    *,
    case_db_id: str,
    source_reference_type: str,
    source_reference_id: str,
    title: str,
    description: str | None,
    category: str,
    priority: str,
    created_by: str,
    owner: str | None = None,
    due_at: datetime | None = None,
    target_status: str | None = None,
    evidence_note: str | None = None,
) -> CaseAction:
    """Create one action per assessment/title, safe against a repeated write."""

    existing = (
        session.query(CaseAction)
        .filter(
            CaseAction.case_db_id == case_db_id,
            CaseAction.source_reference_type == source_reference_type,
            CaseAction.source_reference_id == source_reference_id,
            CaseAction.title == title,
            CaseAction.description == description,
            CaseAction.category == category,
        )
        .one_or_none()
    )
    if existing is not None:
        return existing

    action = create_case_action(
        session,
        case_db_id=case_db_id,
        title=title,
        description=description,
        category=category,
        priority=priority,
        owner=owner,
        due_at=due_at,
        source_reference_type=source_reference_type,
        source_reference_id=source_reference_id,
        created_by=created_by,
    )
    if target_status is not None or evidence_note:
        action = update_case_action(
            session,
            action.id,
            status=target_status,
            evidence_note=evidence_note,
        )
    return action


def _persist_ai_act_assessment(
    session: Session,
    *,
    case: Case,
    request_model: AIActAssessmentRequest,
    result: AIActAssessmentResponse,
    user: UserPrincipal,
) -> None:
    assessment_id = result.meta.assessment_id
    reference_type = "ai_act_assessment"
    actor_name = _actor_name(user)
    add_workspace_reference(
        session,
        case_db_id=case.id,
        reference_type=reference_type,
        reference_id=assessment_id,
        title=_action_title("AI Act-screening · ", request_model.system_name),
        summary=(
            f"{result.classification_label}. Workflowstatus: "
            f"{result.workflow_status}."
        ),
        source_version=result.meta.methodology_version,
        details={
            "request": request_model.model_dump(mode="json"),
            "result": result.model_dump(mode="json"),
            "resolved_case": {
                "id": case.id,
                "case_id": case.case_id,
                "title": case.title,
            },
            "actor": _actor_snapshot(user),
        },
        created_by=actor_name,
    )

    for blocker in result.blockers:
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("AI Act · blokering: ", blocker),
            description=blocker,
            category="condition",
            priority="critical",
            created_by=actor_name,
        )

    obligation_priority = {
        "blocking": "critical",
        "required_if_confirmed": "high",
        "recommended": "medium",
    }
    for obligation in result.obligations:
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("AI Act · pligt: ", obligation.title),
            description=(
                f"{obligation.description}\n\nRetsgrundlag: "
                f"{obligation.source_provision}. Rolle: {obligation.role}."
            ),
            category=(
                "condition"
                if obligation.priority in {"blocking", "required_if_confirmed"}
                else "follow_up"
            ),
            priority=obligation_priority[obligation.priority],
            created_by=actor_name,
        )

    for follow_up in result.follow_up_actions:
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("AI Act · opfølgning: ", follow_up),
            description=follow_up,
            category="follow_up",
            priority="medium",
            created_by=actor_name,
        )


def _persist_fria_assessment(
    session: Session,
    *,
    case: Case,
    request_model: FRIAAssessmentRequest,
    result: FRIAAssessmentResponse,
    user: UserPrincipal,
) -> None:
    assessment_id = result.meta.assessment_id
    reference_type = "fria_assessment"
    actor_name = _actor_name(user)
    add_workspace_reference(
        session,
        case_db_id=case.id,
        reference_type=reference_type,
        reference_id=assessment_id,
        title=_action_title("Grundrettighedsvurdering · ", request_model.system_name),
        summary=(
            f"{result.decision_readiness_label}. Resterende risiko: "
            f"{result.overall_residual_risk}."
        ),
        source_version=result.meta.methodology_version,
        details={
            "request": request_model.model_dump(mode="json"),
            "result": result.model_dump(mode="json"),
            "resolved_case": {
                "id": case.id,
                "case_id": case.case_id,
                "title": case.title,
            },
            "actor": _actor_snapshot(user),
        },
        created_by=actor_name,
    )

    for blocker in result.blockers:
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("Grundrettigheder · blokering: ", blocker),
            description=blocker,
            category="condition",
            priority="critical",
            created_by=actor_name,
        )

    for item in result.action_items:
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("Grundrettigheder · handling: ", item),
            description=item,
            category="follow_up",
            priority="high",
            created_by=actor_name,
        )

    status_map = {
        "planned": "open",
        "in_progress": "in_progress",
        "implemented_unverified": "in_progress",
        "implemented_verified": "completed",
    }
    for measure in request_model.measures:
        due_at = (
            datetime.combine(measure.due_date, time.min, tzinfo=UTC)
            if measure.due_date is not None
            else None
        )
        target_status = status_map[measure.status]
        _ensure_action(
            session,
            case_db_id=case.id,
            source_reference_type=reference_type,
            source_reference_id=assessment_id,
            title=_action_title("Foranstaltning · ", measure.title),
            description=measure.description,
            category="measure",
            priority=("low" if target_status == "completed" else "high"),
            owner=measure.owner[:128],
            due_at=due_at,
            target_status=target_status,
            evidence_note=measure.evidence or None,
            created_by=actor_name,
        )


@router.post(
    "/api/ai-act/assess",
    response_model=AIActAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_ai_act_assessment(
    assessment_request: AIActAssessmentRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(ASSESSMENT_ACCESS),
) -> AIActAssessmentResponse:
    """Run and atomically retain a case-linked EU AI Act screening."""

    case = _resolve_case(db, assessment_request.case_id)
    result = assess_ai_act(assessment_request)
    try:
        _persist_ai_act_assessment(
            db,
            case=case,
            request_model=assessment_request,
            result=result,
            user=user,
        )
        db.commit()
    except (SQLAlchemyError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "AI Act-vurderingen kunne ikke gemmes atomisk og returneres "
                "derfor ikke."
            ),
        ) from exc
    return result


@router.post(
    "/api/fria/assess",
    response_model=FRIAAssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_fria_assessment(
    assessment_request: FRIAAssessmentRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(ASSESSMENT_ACCESS),
) -> FRIAAssessmentResponse:
    """Run and atomically retain a case-linked FRAIA/Article 27 assessment."""

    case = _resolve_case(db, assessment_request.case_id)
    result = assess_fria(assessment_request)
    try:
        _persist_fria_assessment(
            db,
            case=case,
            request_model=assessment_request,
            result=result,
            user=user,
        )
        db.commit()
    except (SQLAlchemyError, ValueError) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Grundrettighedsvurderingen kunne ikke gemmes atomisk og "
                "returneres derfor ikke."
            ),
        ) from exc
    return result
