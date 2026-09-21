"""Authenticated procurement intake and immutable evidence-review workflow."""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text, update
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, require_roles
from src.database.cases import Case, create_case
from src.database.connection import get_db
from src.database.procurement import (
    ProcurementAnalysis,
    ProcurementFactReview,
    ProcurementProfile,
)
from src.services.procurement_analysis import (
    MaterialAnalysisError,
    MaterialChangedError,
    MaterialUnavailableError,
    analyze_case,
    digest,
    evidence_for_case,
    latest_analysis,
    source_fingerprint,
)


router = APIRouter(tags=["procurement"])
ACCESS = require_roles(
    "Hammeren.Sagsbehandler", "Hammeren.Godkender", "Hammeren.DPO", "Hammeren.Admin"
)
Actor = Annotated[UserPrincipal, Depends(ACCESS)]
Database = Annotated[Session, Depends(get_db)]


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    system_name: str = Field(min_length=2, max_length=255)
    supplier_name: str = Field(default="", max_length=500)
    organisation: str = Field(min_length=2, max_length=500)
    department: str = Field(min_length=2, max_length=500)
    owner: str = Field(min_length=2, max_length=500)
    intended_use: str = Field(min_length=20, max_length=10000)
    procurement_stage: Literal["new_purchase", "renewal", "change"]
    journal_reference: str = Field(default="", max_length=100)


class ProfileUpdate(ProfileInput):
    revision: int = Field(ge=1)


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    analysis_id: str = Field(min_length=1, max_length=36)
    accepted_fact_ids: list[str] = Field(max_length=20)
    note: str = Field(default="", max_length=10000)


def require_profile(db: Session, case_id: str) -> ProcurementProfile:
    if not db.get(Case, case_id):
        raise HTTPException(404, "Sagen blev ikke fundet.")
    profile = db.get(ProcurementProfile, case_id)
    if not profile:
        raise HTTPException(404, "Sagen har ingen profil for den løsning, der skal vurderes.")
    return profile


def profile_notes(payload: dict) -> str:
    stages = {
        "new_purchase": "Ny anskaffelse",
        "renewal": "Kontraktfornyelse",
        "change": "Ændret anvendelse",
    }
    return (
        f"{stages[payload['procurement_stage']]} · {payload['organisation']} · {payload['department']}\nSystemejer: {payload['owner']}\nPåtænkt anvendelse: {payload['intended_use']}"
        + (
            f"\nJournalreference: {payload['journal_reference']}"
            if payload.get("journal_reference")
            else ""
        )
    )


def latest_review(db: Session, case_id: str) -> dict | None:
    review = (
        db.query(ProcurementFactReview)
        .filter_by(case_id=case_id)
        .order_by(
            ProcurementFactReview.created_at.desc(), ProcurementFactReview.id.desc()
        )
        .first()
    )
    return review.to_dict() if review else None


@router.post("/api/v3/procurements", status_code=201)
def create_procurement(payload: ProfileInput, db: Database, actor: Actor):
    data = payload.model_dump()
    try:
        case = create_case(
            db,
            case_id=f"FS-{datetime.now(UTC).year}-{uuid4().hex[:12].upper()}",
            title=data["system_name"],
            assigned_to=data["owner"][:64],
            notes=profile_notes(data),
        )
        profile = ProcurementProfile(case_id=case.id, payload=data, revision=1)
        db.add(profile)
        db.flush()
        result = {"case_id": case.id, "profile": profile.to_dict()}
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.get("/api/v3/cases/{case_id}/procurement")
def get_procurement(case_id: str, db: Database, actor: Actor):
    profile = require_profile(db, case_id)
    return {
        "profile": profile.to_dict(),
        "analysis": latest_analysis(db, case_id),
        "review": latest_review(db, case_id),
    }


@router.patch("/api/v3/cases/{case_id}/procurement")
def update_procurement(
    case_id: str, payload: ProfileUpdate, db: Database, actor: Actor
):
    profile = require_profile(db, case_id)
    data = payload.model_dump(exclude={"revision"})
    if profile.revision == payload.revision and profile.payload == data:
        return {
            "profile": profile.to_dict(),
            "analysis": latest_analysis(db, case_id),
            "review": latest_review(db, case_id),
        }
    changed = db.execute(
        update(ProcurementProfile)
        .where(
            ProcurementProfile.case_id == case_id,
            ProcurementProfile.revision == payload.revision,
        )
        .values(
            payload=data, revision=payload.revision + 1, updated_at=datetime.now(UTC)
        )
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(
            409, "Sagen er ændret af en anden bruger. Genindlæs oplysningerne."
        )
    case = db.get(Case, case_id)
    case.title, case.assigned_to, case.notes = (
        data["system_name"],
        data["owner"][:64],
        profile_notes(data),
    )
    db.commit()
    db.expire_all()
    return {
        "profile": require_profile(db, case_id).to_dict(),
        "analysis": latest_analysis(db, case_id),
        "review": latest_review(db, case_id),
    }


@router.post("/api/v3/cases/{case_id}/procurement/analyze", status_code=201)
def run_analysis(case_id: str, db: Database, actor: Actor):
    require_profile(db, case_id)
    try:
        return analyze_case(db, case_id)
    except MaterialUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc
    except MaterialChangedError as exc:
        raise HTTPException(409, str(exc)) from exc
    except MaterialAnalysisError as exc:
        raise HTTPException(422, str(exc)) from exc


def ensure_current_analysis(
    db: Session,
    case_id: str,
    analysis: ProcurementAnalysis,
    profile: ProcurementProfile,
):
    try:
        current = analysis.profile_fingerprint == digest(
            profile.to_dict()
        ) and analysis.source_fingerprint == source_fingerprint(
            evidence_for_case(db, case_id)
        )
    except (ValueError, OSError):
        current = False
    if not current:
        raise HTTPException(
            409,
            "Kilder eller oplysninger er ændret. Analysér det aktuelle grundlag før gennemgangen fortsætter.",
        )


@router.post("/api/v3/cases/{case_id}/procurement/review", status_code=201)
def review_facts(case_id: str, payload: ReviewInput, db: Database, actor: Actor):
    # Serialize source/profile mutation with accepting facts from that snapshot.
    db.rollback()
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        db.query(Case).filter_by(id=case_id).with_for_update().first()
    db.expire_all()
    profile = require_profile(db, case_id)
    analysis = db.get(ProcurementAnalysis, payload.analysis_id)
    if not analysis or analysis.case_id != case_id:
        raise HTTPException(404, "Analysen findes ikke på sagen.")
    ensure_current_analysis(db, case_id, analysis, profile)
    facts = {fact["id"]: fact for fact in analysis.generation_payload["facts"]}
    accepted = payload.accepted_fact_ids
    if len(set(accepted)) != len(accepted) or any(
        fact_id not in facts for fact_id in accepted
    ):
        raise HTTPException(
            422, "Gennemgangen indeholder ukendte eller gentagne oplysninger."
        )
    flagged = {
        check["id"].removeprefix("fact:")
        for check in analysis.generation_payload["review"]["checks"]
        if check["requires_review"]
    }
    if set(accepted) & flagged and len(payload.note) < 20:
        raise HTTPException(
            422,
            "Beskriv din faglige afklaring, før en oplysning markeret af JEV anvendes (mindst 20 tegn).",
        )
    data = profile.payload
    prefill = {
        "project_name": data["system_name"],
        "organisation": data["organisation"],
        "department": data["department"],
        "owner": data["owner"],
        "supplier_name": data["supplier_name"],
        "purpose": data["intended_use"],
        "processing_version": {
            "new_purchase": "Anskaffelse",
            "renewal": "Kontraktfornyelse",
            "change": "Ændret anvendelse",
        }[data["procurement_stage"]],
    }
    for fact_id in accepted:
        fact = facts[fact_id]
        if fact["field"] != "purpose":
            prefill[fact["field"]] = fact["value"]
    review = ProcurementFactReview(
        case_id=case_id,
        analysis_id=analysis.id,
        reviewed_by=actor.oid,
        payload={
            "accepted_fact_ids": accepted,
            "note": payload.note,
            "dpia_prefill": prefill,
            "purpose": "Oplysninger gennemgået til vurderingsgrundlag; ikke juridisk godkendelse.",
        },
    )
    db.add(review)
    db.flush()
    result = review.to_dict()
    db.commit()
    return result


@router.get("/api/v3/cases/{case_id}/procurement/reviews/{review_id}")
def get_fact_review(case_id: str, review_id: str, db: Database, actor: Actor):
    profile = require_profile(db, case_id)
    review = db.get(ProcurementFactReview, review_id)
    if not review or review.case_id != case_id:
        raise HTTPException(404, "Gennemgangen findes ikke på sagen.")
    analysis = db.get(ProcurementAnalysis, review.analysis_id)
    ensure_current_analysis(db, case_id, analysis, profile)
    return review.to_dict()
