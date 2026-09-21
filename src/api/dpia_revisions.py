"""Authenticated, immutable editorial versions of saved DPIA reports."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal
from src.database.connection import get_db
from src.database.dpia import assessment_result_payload
from src.services.dpia_assessment import DPIAAssessmentResponse
from src.services.dpia_revisions import (
    RevisionConflict,
    RevisionInput,
    revise_assessment,
    revision_history,
)

router = APIRouter(tags=["dpia-revisions"])


@router.post(
    "/api/dpia/assessments/{assessment_id}/revisions",
    response_model=DPIAAssessmentResponse,
    status_code=201,
)
def create_revision(
    assessment_id: str,
    payload: RevisionInput,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    try:
        saved = revise_assessment(
            db, assessment_id, payload, actor_id=user.oid, actor_name=user.name
        )
        from src.database.dpia import assessment_display_payload
        result = assessment_display_payload(saved, db)
        db.commit()
        return DPIAAssessmentResponse.model_validate(result)
    except LookupError as exc:
        db.rollback()
        raise HTTPException(404, str(exc)) from None
    except RevisionConflict as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from None
    except ValueError as exc:
        db.rollback()
        raise HTTPException(422, str(exc)) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            503,
            "Rapportversionen kunne ikke gemmes. Den oprindelige version er bevaret.",
        ) from None


@router.get("/api/dpia/assessments/{assessment_id}/revisions")
def get_revisions(
    assessment_id: str,
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    try:
        return revision_history(db, assessment_id, limit=limit)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from None
