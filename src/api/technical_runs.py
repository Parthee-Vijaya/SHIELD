"""Authenticated execution history and separately audited human follow-up."""

from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from src.api.workspace import WORKSPACE_ACCESS
from src.auth import UserPrincipal
from src.database.connection import get_db
from src.services.technical_controls import (
    ControlConflict,
    attach_human_controls,
    create_control,
    update_control,
)
from src.services.technical_runs import build_technical_runs

router = APIRouter(tags=["technical-runs"])
Question = Annotated[str, Field(strict=True, min_length=1, max_length=2000)]
Notes = Annotated[str, Field(strict=True, max_length=12000)]
Owner = Annotated[str, Field(strict=True, max_length=200)]
ControlStatus = Literal["open", "in_progress", "completed", "dismissed"]


class CreateControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    assessment_id: Annotated[str, Field(strict=True, min_length=1, max_length=36)]
    original_check_id: (
        Annotated[str, Field(strict=True, min_length=1, max_length=200)] | None
    ) = None
    question: Question
    notes: Notes = ""
    owner: Owner = ""
    status: ControlStatus = "open"


class UpdateControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_version: Annotated[int, Field(strict=True, ge=1)]
    question: Question | None = None
    notes: Notes | None = None
    owner: Owner | None = None
    status: ControlStatus | None = None

    @model_validator(mode="after")
    def require_patch(self):
        fields = self.model_fields_set - {"expected_version"}
        if not fields or any(getattr(self, key) is None for key in fields):
            raise ValueError("Angiv mindst én ændring. Felterne må ikke være null.")
        return self


@router.get("/api/v3/cases/{case_id}/technical-runs")
def get_technical_runs(
    case_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict:
    try:
        return attach_human_controls(db, build_technical_runs(db, case_id))
    except SQLAlchemyError as exc:
        raise HTTPException(
            503, detail="Kørselsoversigten kunne ikke indlæses. Prøv igen senere."
        ) from exc
    except LookupError as exc:
        raise HTTPException(404, detail="Sagen blev ikke fundet.") from exc


def _mutate(db, operation):
    try:
        payload = operation()
        db.commit()
        return payload
    except (ControlConflict, IntegrityError) as exc:
        db.rollback()
        message = (
            str(exc)
            if isinstance(exc, ControlConflict)
            else "Kontrolpunktet er allerede ændret. Genindlæs oversigten."
        )
        raise HTTPException(409, detail=message) from exc
    except LookupError as exc:
        db.rollback()
        raise HTTPException(404, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            503, detail="Kontrolpunktet kunne ikke gemmes. Prøv igen senere."
        ) from exc


@router.post("/api/v3/cases/{case_id}/technical-controls", status_code=201)
def post_control(
    case_id: str,
    request: CreateControlRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    return _mutate(db, lambda: create_control(db, case_id, request.model_dump(), user))


@router.patch("/api/v3/cases/{case_id}/technical-controls/{control_id}")
def patch_control(
    case_id: str,
    control_id: str,
    request: UpdateControlRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
):
    return _mutate(
        db,
        lambda: update_control(
            db, case_id, control_id, request.model_dump(exclude_unset=True), user
        ),
    )
