"""Authenticated read-only case execution history."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal
from src.database.connection import get_db
from src.services.technical_runs import build_technical_runs

router = APIRouter(tags=["technical-runs"])


@router.get("/api/v3/cases/{case_id}/technical-runs")
def get_technical_runs(
    case_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict:
    try:
        return build_technical_runs(db, case_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Kørselsoversigten kunne ikke indlæses. Prøv igen senere.",
        ) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Sagen blev ikke fundet.") from exc
