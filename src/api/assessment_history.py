"""Authenticated, read-only grouped assessment history."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal
from src.database.connection import get_db
from src.services.assessment_history import build_assessment_history

router = APIRouter(tags=["assessment-history"])


@router.get("/api/v3/assessment-history")
def assessment_history(
    limit: int = Query(default=8, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(
        default=None, pattern="^(dpia|legal_screening|ai_act|fria)$"
    ),
    status: str | None = Query(default=None, max_length=64),
    search: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    return build_assessment_history(
        db, limit=limit, offset=offset, category=category, status=status, search=search
    )
