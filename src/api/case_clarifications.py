"""Explicit creation and review of AI-suggested clarification tasks."""

from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, require_roles
from src.database.connection import get_db
from src.services.case_clarifications import create_clarifications, list_clarifications, update_clarification

router = APIRouter(tags=["case-clarifications"])
ACCESS = require_roles("Hammeren.Sagsbehandler", "Hammeren.Godkender", "Hammeren.DPO", "Hammeren.Admin")
Actor = Annotated[UserPrincipal, Depends(ACCESS)]
Database = Annotated[Session, Depends(get_db)]


class CreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    analysis_id: str = Field(min_length=1, max_length=36)
    question_ids: list[str] | None = Field(default=None, max_length=100)
    owner: str | None = Field(default=None, max_length=128)
    due_date: date | None = None


class UpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_updated_at: datetime
    owner: str | None = Field(default=None, max_length=128)
    due_date: date | None = None
    answer: str | None = Field(default=None, max_length=20000)
    status: Literal["open", "in_progress", "completed", "dismissed"] | None = None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set - {"expected_updated_at"}:
            raise ValueError("Angiv mindst én ændring.")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Status må ikke være tom.")
        return self


@router.get("/api/v3/cases/{case_id}/clarifications")
def get_clarifications(case_id: str, db: Database, actor: Actor, analysis_id: str = Query(min_length=1, max_length=36)):
    items = list_clarifications(db, case_id, analysis_id)
    return {"items": items, "count": len(items)}


@router.post("/api/v3/cases/{case_id}/clarifications")
def post_clarifications(case_id: str, payload: CreateInput, db: Database, actor: Actor):
    try:
        items = create_clarifications(
            db, case_id, payload.analysis_id, question_ids=payload.question_ids,
            owner=payload.owner, due_date=payload.due_date,
            actor=(actor.name or actor.username or actor.oid or "Sagsbehandler")[:128],
        )
        db.commit()
        return {"items": items, "count": len(items)}
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Afklaringslisten kunne ikke gemmes. Prøv igen.") from exc


@router.patch("/api/v3/cases/{case_id}/clarifications/{action_id}")
def patch_clarification(case_id: str, action_id: str, payload: UpdateInput, db: Database, actor: Actor):
    try:
        result = update_clarification(
            db, case_id, action_id, expected_updated_at=payload.expected_updated_at,
            changes=payload.model_dump(exclude_unset=True, exclude={"expected_updated_at"}),
        )
        db.commit()
        return result
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Afklaringen kunne ikke gemmes. Prøv igen.") from exc
