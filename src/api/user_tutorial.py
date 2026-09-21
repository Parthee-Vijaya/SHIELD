"""Authenticated per-user first-run tutorial state."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, require_roles
from src.database.connection import get_db
from src.database.user_tutorial import (
    TutorialStatus,
    TutorialStep,
    UserTutorialState,
    get_tutorial_state,
    save_tutorial_state,
)

router = APIRouter(prefix="/api/user", tags=["user-tutorial"])
CASE_ACCESS = require_roles(
    "Hammeren.Sagsbehandler", "Hammeren.Godkender", "Hammeren.DPO", "Hammeren.Admin"
)


class TutorialStateResponse(BaseModel):
    tutorial_version: Literal[1] = 1
    status: TutorialStatus = "not_started"
    step_id: TutorialStep | None = None
    updated_at: datetime | None = None


class TutorialStatePatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    tutorial_version: Literal[1] = 1
    status: TutorialStatus
    step_id: TutorialStep | None = None

    @field_validator("tutorial_version", mode="before")
    @classmethod
    def version_is_integer(cls, value):
        if type(value) is not int:
            raise ValueError("tutorial_version skal være heltallet 1")
        return value


def _response(record: UserTutorialState | None) -> TutorialStateResponse:
    if record is None:
        return TutorialStateResponse()
    timestamp = record.updated_at
    if timestamp.tzinfo is None:
        # SQLite returns naive datetimes; persisted timestamps are always UTC.
        timestamp = timestamp.replace(tzinfo=UTC)
    return TutorialStateResponse.model_validate(
        {
            "tutorial_version": record.tutorial_version,
            "status": record.status,
            "step_id": record.step_id,
            "updated_at": timestamp.astimezone(UTC),
        }
    )


@router.get("/tutorial", response_model=TutorialStateResponse)
def read_tutorial_state(
    response: Response,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(CASE_ACCESS),
) -> TutorialStateResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        return _response(get_tutorial_state(db, user.oid))
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            503, "Guidens status kunne ikke læses. Prøv igen."
        ) from None


@router.patch("/tutorial", response_model=TutorialStateResponse)
def update_tutorial_state(
    payload: TutorialStatePatch,
    response: Response,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(CASE_ACCESS),
) -> TutorialStateResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        record = save_tutorial_state(
            db,
            user_oid=user.oid,
            status=payload.status,
            step_id=payload.step_id,
            update_step="step_id" in payload.model_fields_set,
        )
        result = _response(record)
        db.commit()
        return result
    except (SQLAlchemyError, ValueError):
        db.rollback()
        raise HTTPException(
            503, "Guidens status kunne ikke gemmes. Prøv igen."
        ) from None
