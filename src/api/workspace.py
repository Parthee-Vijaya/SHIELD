"""HTTP boundary for Hammeren's unified case workspace.

The domain modules below deliberately contain no FastAPI concerns.  This
router adds authenticated access, transaction boundaries and safe binary
document handling while keeping every decision linked to a verified actor.
"""

from __future__ import annotations

import os
from datetime import datetime
from io import BytesIO
from typing import Annotated, Any, Literal, NoReturn
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from src.auth import UserPrincipal, authorize_case_transition, require_roles
from src.database.case_workspace import (
    CaseAction,
    CaseApproval,
    create_case_action,
    decide_case_approval,
    request_case_approval,
    update_case_action,
    update_assessment_owner,
)
from src.database.cases import Case, get_case, transition_case
from src.database.connection import get_db
from src.database.document_bank import (
    DOCUMENT_CATEGORIES,
    MunicipalDocument,
    MunicipalDocumentVersion,
    add_document_version,
    approve_document_version,
    create_document,
    link_document_to_case,
    list_documents,
)
from src.database.legal_monitoring import CaseReassessment
from src.services.case_workspace_service import (
    build_case_export_bundle,
    build_case_workspace,
)
from src.services.document_bank_storage import (
    StoredBankFile,
    delete_document_bytes,
    read_document_bytes,
    store_document_bytes,
)
from src.services.law_change_impact import list_reassessments, update_reassessment


router = APIRouter(tags=["case-workspace"])

WORKSPACE_ACCESS = require_roles(
    "Hammeren.Sagsbehandler",
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
)
APPROVER_ACCESS = require_roles(
    "Hammeren.Godkender",
    "Hammeren.DPO",
    "Hammeren.Admin",
)
APPROVER_ROLES = frozenset({"Hammeren.Godkender", "Hammeren.DPO", "Hammeren.Admin"})

ActionCategory = Literal[
    "measure", "condition", "evidence", "reassessment", "follow_up", "other"
]
ActionStatus = Literal["open", "in_progress", "completed", "dismissed"]
ActionPriority = Literal["low", "medium", "high", "critical"]
ApprovalType = Literal["case", "dpia", "ai_act", "fria", "deployment"]
ApprovalDecision = Literal[
    "approved", "approved_with_conditions", "rejected", "changes_requested"
]
DocumentCategory = Literal[
    "data_processing_agreement",
    "policy",
    "security_documentation",
    "supplier_documentation",
    "assessment",
    "template",
    "other",
]
DocumentLinkRole = Literal["evidence", "basis", "attachment", "output", "template"]
ReassessmentStatus = Literal["open", "in_progress", "completed", "dismissed"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CaseActionCreate(StrictModel):
    title: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=20_000)
    category: ActionCategory = "measure"
    priority: ActionPriority = "medium"
    owner: str | None = Field(default=None, max_length=128)
    due_at: datetime | None = None
    source_reference_type: str | None = Field(default=None, max_length=32)
    source_reference_id: str | None = Field(default=None, max_length=128)


class CaseActionUpdate(StrictModel):
    status: ActionStatus | None = None
    owner: str | None = Field(default=None, max_length=128)
    due_at: datetime | None = None
    evidence_note: str | None = Field(default=None, max_length=20_000)

    @model_validator(mode="after")
    def at_least_one_change(self) -> "CaseActionUpdate":
        if not self.model_fields_set:
            raise ValueError("mindst ét felt skal ændres")
        return self


class AssessmentMetadataUpdate(StrictModel):
    owner: str | None = Field(max_length=128)


class CaseApprovalRequest(StrictModel):
    approval_type: ApprovalType = "case"
    subject_reference_type: str | None = Field(default=None, max_length=32)
    subject_reference_id: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=5_000)


class CaseApprovalDecisionRequest(StrictModel):
    decision: ApprovalDecision
    reason: str = Field(min_length=20, max_length=20_000)
    conditions: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("conditions")
    @classmethod
    def normalize_conditions(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            cleaned = " ".join(value.split())
            if len(cleaned) < 5:
                raise ValueError("hvert vilkår skal være mindst 5 tegn")
            if len(cleaned) > 1_000:
                raise ValueError("et vilkår må højst være 1.000 tegn")
            if cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    @model_validator(mode="after")
    def conditions_match_decision(self) -> "CaseApprovalDecisionRequest":
        if self.decision == "approved_with_conditions" and not self.conditions:
            raise ValueError("en betinget godkendelse kræver mindst ét vilkår")
        if self.decision != "approved_with_conditions" and self.conditions:
            raise ValueError("vilkår må kun angives ved betinget godkendelse")
        return self


class DocumentUploadMetadata(StrictModel):
    """JSON metadata sent in the multipart ``metadata`` form field."""

    document_id: str | None = Field(default=None, max_length=36)
    title: str | None = Field(default=None, min_length=3, max_length=500)
    category: DocumentCategory = "other"
    document_key: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=20_000)
    owner: str | None = Field(default=None, max_length=128)
    classification: str | None = Field(default=None, max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=50)
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    review_at: datetime | None = None
    version_metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized = sorted(
            {" ".join(value.split()) for value in values if value.strip()}
        )
        if any(len(value) > 80 for value in normalized):
            raise ValueError("et tag må højst være 80 tegn")
        return normalized

    @model_validator(mode="after")
    def validate_document_identity(self) -> "DocumentUploadMetadata":
        if not self.document_id and not self.title:
            raise ValueError("title er påkrævet ved oprettelse af et nyt dokument")
        if self.valid_from and self.valid_to and self.valid_to <= self.valid_from:
            raise ValueError("valid_to skal ligge efter valid_from")
        return self


class DocumentVersionApprovalRequest(StrictModel):
    approval_note: str = Field(min_length=10, max_length=10_000)


class CaseDocumentLinkRequest(StrictModel):
    document_version_id: str | None = Field(default=None, max_length=36)
    link_role: DocumentLinkRole = "evidence"
    note: str | None = Field(default=None, max_length=10_000)


class ReassessmentUpdateRequest(StrictModel):
    status: ReassessmentStatus
    assigned_to: str | None = Field(default=None, max_length=128)
    resolution_note: str | None = Field(default=None, max_length=20_000)

    @model_validator(mode="after")
    def resolution_requires_note(self) -> "ReassessmentUpdateRequest":
        if (
            self.status in {"completed", "dismissed"}
            and len(self.resolution_note or "") < 20
        ):
            raise ValueError("afslutning kræver en begrundelse på mindst 20 tegn")
        return self


def _actor_name(user: UserPrincipal, *, max_length: int = 128) -> str:
    return user.name[:max_length]


def _actor_snapshot(user: UserPrincipal) -> dict[str, Any]:
    return {
        "oid": user.oid,
        "name": user.name,
        "username": user.username,
        "roles": list(user.roles),
        "auth_mode": user.auth_mode,
        "identity_assurance": user.identity_assurance,
    }


def _get_case_or_404(db: Session, case_db_id: str) -> Case:
    case = get_case(db, case_db_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Sagen findes ikke.")
    return case


def _raise_domain_error(exc: ValueError) -> NoReturn:
    detail = str(exc)
    lowered = detail.lower()
    if "not found" in lowered or "findes ikke" in lowered:
        raise HTTPException(status_code=404, detail=detail) from exc
    if any(
        phrase in lowered
        for phrase in (
            "already",
            "allerede",
            "only approved",
            "no approved version",
            "cannot approve",
            "kan ikke",
        )
    ):
        raise HTTPException(status_code=409, detail=detail) from exc
    raise HTTPException(status_code=422, detail=detail) from exc


def _document_version_payload(version: MunicipalDocumentVersion) -> dict[str, Any]:
    payload = version.to_dict()
    payload.pop("storage_key", None)
    payload["download_href"] = (
        f"/api/v3/documents/{version.document_id}/versions/{version.id}/download"
    )
    return payload


def _document_payload(document: MunicipalDocument) -> dict[str, Any]:
    payload = document.to_dict()
    versions = sorted(document.versions, key=lambda item: item.version_number)
    payload["versions"] = [_document_version_payload(item) for item in versions]
    payload["latest_version"] = (
        _document_version_payload(versions[-1]) if versions else None
    )
    return payload


def _reassessment_payload(reassessment: CaseReassessment) -> dict[str, Any]:
    payload = reassessment.to_dict()
    payload["case"] = reassessment.case.to_dict() if reassessment.case else None
    return payload


def _max_document_bytes() -> int:
    raw = os.getenv("DOCUMENT_BANK_MAX_BYTES", str(50 * 1024 * 1024))
    try:
        return max(1, int(raw))
    except ValueError:
        return 50 * 1024 * 1024


async def _read_upload(file: UploadFile) -> bytes:
    maximum = _max_document_bytes()
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > maximum:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Dokumentet må højst fylde {maximum} bytes.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _blocking_decision_material(db: Session, case_db_id: str) -> list[str]:
    blockers: list[str] = []
    actions = (
        db.query(CaseAction)
        .filter(
            CaseAction.case_db_id == case_db_id,
            CaseAction.status.in_(["open", "in_progress"]),
        )
        .all()
    )
    blocking_actions = [
        item
        for item in actions
        if item.priority in {"high", "critical"} or item.category == "condition"
    ]
    if blocking_actions:
        blockers.append(
            f"{len(blocking_actions)} væsentlige foranstaltninger er ikke afsluttet."
        )
    open_reassessments = list_reassessments(
        db, case_db_id=case_db_id, status="open"
    ) + list_reassessments(db, case_db_id=case_db_id, status="in_progress")
    if open_reassessments:
        blockers.append(
            f"{len(open_reassessments)} lovændringer afventer genvurdering."
        )
    return blockers


@router.get("/api/v3/cases/overview")
def get_cases_overview(
    scope: Literal["all", "work", "examples"] = "all",
    limit: int = Query(default=500, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    from src.services.case_overview_service import build_case_overview

    return build_case_overview(db, scope=scope, limit=limit)


@router.get("/api/v3/cases/{case_db_id}/workspace")
def get_case_workspace(
    case_db_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    try:
        return build_case_workspace(db, case_db_id)
    except ValueError as exc:
        _raise_domain_error(exc)


@router.patch(
    "/api/v3/cases/{case_db_id}/assessments/{assessment_type}/{assessment_id}/metadata"
)
def patch_assessment_metadata(
    case_db_id: str,
    assessment_type: str,
    assessment_id: str,
    request: AssessmentMetadataUpdate,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    groups = {
        "dpia_assessment": "dpia",
        "legal_screening": "legal_screening",
        "ai_act_assessment": "ai_act",
        "fria_assessment": "fria",
    }
    group = groups.get(assessment_type)
    if group is None:
        raise HTTPException(status_code=404, detail="Vurderingstypen findes ikke.")
    workspace = build_case_workspace(db, case_db_id)
    assessment = next(
        (
            item
            for item in workspace["assessments"][group]
            if item.get("assessment_id") == assessment_id
        ),
        None,
    )
    if assessment is None:
        raise HTTPException(status_code=404, detail="Vurderingen findes ikke på sagen.")
    try:
        reference = update_assessment_owner(
            db,
            case_db_id=case_db_id,
            reference_type=assessment_type,
            reference_id=assessment_id,
            owner=request.owner,
            updated_by=_actor_name(user),
            actor_id=user.oid,
        )
        db.commit()
        return {
            "assessment_id": assessment_id,
            "type": assessment_type,
            **reference.details.get("workspace_metadata", {"owner": None}),
        }
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Vurderingens ejer kunne ikke opdateres."
        ) from exc


@router.get("/api/v3/cases/{case_db_id}/export.json")
def export_case_workspace(
    case_db_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> JSONResponse:
    case = _get_case_or_404(db, case_db_id)
    try:
        bundle = build_case_export_bundle(db, case_db_id)
    except ValueError as exc:
        _raise_domain_error(exc)
    safe_case_id = (
        "".join(
            character
            for character in case.case_id
            if character.isalnum() or character in "-_"
        )[:64]
        or "sag"
    )
    revision_id = bundle["revision_id"]
    return JSONResponse(
        content=jsonable_encoder(bundle),
        headers={
            "Content-Disposition": f'attachment; filename="shield-{safe_case_id}-{revision_id}.json"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post(
    "/api/v3/cases/{case_db_id}/actions",
    status_code=status.HTTP_201_CREATED,
)
def add_case_action(
    case_db_id: str,
    request: CaseActionCreate,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    try:
        action = create_case_action(
            db,
            case_db_id=case_db_id,
            title=request.title,
            description=request.description,
            category=request.category,
            priority=request.priority,
            owner=request.owner,
            due_at=request.due_at,
            source_reference_type=request.source_reference_type,
            source_reference_id=request.source_reference_id,
            created_by=_actor_name(user),
        )
        db.commit()
        db.refresh(action)
        return action.to_dict()
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Foranstaltningen kunne ikke gemmes."
        ) from exc


@router.patch("/api/v3/cases/{case_db_id}/actions/{action_id}")
def patch_case_action(
    case_db_id: str,
    action_id: str,
    request: CaseActionUpdate,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    action = db.get(CaseAction, action_id)
    if action is None or action.case_db_id != case_db_id:
        raise HTTPException(
            status_code=404, detail="Foranstaltningen findes ikke på sagen."
        )
    try:
        action = update_case_action(
            db,
            action_id,
            status=request.status,
            updated_by=_actor_name(user),
            actor_id=user.oid,
            actor_kind="human",
            owner=(
                (request.owner or "") if "owner" in request.model_fields_set else None
            ),
            due_at=request.due_at if "due_at" in request.model_fields_set else None,
            due_at_supplied="due_at" in request.model_fields_set,
            evidence_note=(
                request.evidence_note
                if "evidence_note" in request.model_fields_set
                else None
            ),
        )
        db.commit()
        db.refresh(action)
        return action.to_dict()
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Foranstaltningen kunne ikke opdateres."
        ) from exc


@router.post(
    "/api/v3/cases/{case_db_id}/approvals",
    status_code=status.HTTP_201_CREATED,
)
def add_case_approval_request(
    case_db_id: str,
    request: CaseApprovalRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    workspace = build_case_workspace(db, case_db_id)
    readiness = workspace["readiness"]
    if request.approval_type == "deployment":
        can_request = (
            readiness["can_deploy"] and not readiness["pending_approval_count"]
        )
    else:
        can_request = readiness["can_request_approval"]
    if not can_request:
        blockers = readiness.get("blockers") or [
            "Sagen opfylder ikke betingelserne for den ønskede godkendelse."
        ]
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Godkendelse kan ikke anmodes endnu.",
                "blockers": blockers,
            },
        )
    snapshot = {
        "schema_version": workspace["schema_version"],
        "case": workspace["case"],
        "readiness": readiness,
        "assessment_references": workspace["assessments"]["references"],
        "requested_by": _actor_snapshot(user),
        "note": request.note,
    }
    try:
        approval = request_case_approval(
            db,
            case_db_id=case_db_id,
            requested_by=_actor_name(user),
            approval_type=request.approval_type,
            subject_reference_type=request.subject_reference_type,
            subject_reference_id=request.subject_reference_id,
            decision_snapshot=snapshot,
        )
        db.commit()
        db.refresh(approval)
        return approval.to_dict()
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Godkendelsesanmodningen kunne ikke gemmes."
        ) from exc


@router.post("/api/v3/cases/{case_db_id}/approvals/{approval_id}/decision")
def decide_case_approval_request(
    case_db_id: str,
    approval_id: str,
    request: CaseApprovalDecisionRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(APPROVER_ACCESS),
) -> dict[str, Any]:
    case = _get_case_or_404(db, case_db_id)
    approval = db.get(CaseApproval, approval_id)
    if approval is None or approval.case_db_id != case_db_id:
        raise HTTPException(
            status_code=404, detail="Godkendelsesanmodningen findes ikke på sagen."
        )
    if approval.status != "pending":
        raise HTTPException(
            status_code=409, detail="Godkendelsesanmodningen er allerede afgjort."
        )

    if request.decision == "approved":
        blockers = _blocking_decision_material(db, case_db_id)
        if case.last_aggregate_status != "GO" or not case.last_assessment_log_id:
            blockers.append("Sagen mangler en aktuel vurdering uden blokeringer.")
        if blockers:
            raise HTTPException(
                status_code=409,
                detail={"message": "Sagen kan ikke godkendes.", "blockers": blockers},
            )

    try:
        approval = decide_case_approval(
            db,
            approval_id,
            decision=request.decision,
            decided_by=_actor_name(user),
            reason=request.reason,
            conditions=request.conditions,
            is_identity_verified=(user.identity_assurance == "verified_entra_token"),
            actor_oid=user.oid,
            auth_mode=user.auth_mode,
            identity_assurance=user.identity_assurance,
        )

        if request.decision == "approved":
            target_status = (
                "idriftsat" if approval.approval_type == "deployment" else "godkendt"
            )
            authorize_case_transition(user, target_status)
            transition_case(
                db,
                case_db_id,
                target_status,
                note=request.reason,
                changed_by=_actor_name(user, max_length=64),
                confirmed=True,
            )
        elif request.decision == "approved_with_conditions":
            # decide_case_approval() creates one blocking action per condition.
            # Keeping that domain side-effect in one place prevents duplicated
            # conditions when the HTTP transaction is committed.
            if case.status in {"vurderet", "godkendt", "idriftsat"}:
                transition_case(
                    db,
                    case_db_id,
                    "remediation",
                    note=request.reason,
                    changed_by=_actor_name(user, max_length=64),
                )
        elif case.status in {"vurderet", "godkendt", "idriftsat"}:
            transition_case(
                db,
                case_db_id,
                "remediation",
                note=request.reason,
                changed_by=_actor_name(user, max_length=64),
            )

        db.commit()
        db.refresh(approval)
        db.refresh(case)
        return {"approval": approval.to_dict(), "case": case.to_dict()}
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Godkendelsesbeslutningen kunne ikke gemmes atomisk.",
        ) from exc


@router.get("/api/v3/documents")
def get_documents(
    category: DocumentCategory | None = None,
    owner: str | None = Query(default=None, max_length=128),
    include_inactive: bool = False,
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    documents = list_documents(
        db,
        category=category,
        owner=owner,
        include_inactive=include_inactive,
        limit=limit,
    )
    return {
        "documents": [_document_payload(document) for document in documents],
        "count": len(documents),
        "allowed_categories": sorted(DOCUMENT_CATEGORIES),
    }


@router.post("/api/v3/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    metadata: Annotated[
        str,
        Form(
            description=(
                "JSON serialized DocumentUploadMetadata. Supply document_id to "
                "add a version to an existing logical document."
            )
        ),
    ],
    file: Annotated[UploadFile, File(description="PDF, DOCX, XLSX or UTF-8 TXT")],
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    try:
        upload_metadata = DocumentUploadMetadata.model_validate_json(metadata)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "Dokumentmetadata er ugyldige.", "errors": exc.errors()},
        ) from exc

    stored: StoredBankFile | None = None
    committed = False
    try:
        content = await _read_upload(file)
        if upload_metadata.document_id:
            document = (
                db.query(MunicipalDocument)
                .filter(MunicipalDocument.id == upload_metadata.document_id)
                .with_for_update()
                .one_or_none()
            )
            if document is None:
                raise ValueError(f"document not found: {upload_metadata.document_id}")
        else:
            document = create_document(
                db,
                title=upload_metadata.title or "",
                category=upload_metadata.category,
                document_key=upload_metadata.document_key,
                description=upload_metadata.description,
                owner=upload_metadata.owner,
                classification=upload_metadata.classification,
                tags=upload_metadata.tags,
                created_by=_actor_name(user),
            )

        latest_number = (
            db.query(func.max(MunicipalDocumentVersion.version_number))
            .filter(MunicipalDocumentVersion.document_id == document.id)
            .scalar()
            or 0
        )
        next_version = latest_number + 1
        declared_type = (file.content_type or "").strip().lower()
        if declared_type in {"", "application/octet-stream"}:
            declared_type = None
        stored = store_document_bytes(
            document_id=document.id,
            version_number=next_version,
            filename=file.filename or "",
            content=content,
            declared_media_type=declared_type,
        )
        version = add_document_version(
            db,
            document_id=document.id,
            original_filename=stored.original_filename,
            media_type=stored.media_type,
            size_bytes=stored.size_bytes,
            sha256=stored.sha256,
            version_number=next_version,
            valid_from=upload_metadata.valid_from,
            valid_to=upload_metadata.valid_to,
            review_at=upload_metadata.review_at,
            uploaded_by=_actor_name(user),
            metadata={
                **upload_metadata.version_metadata,
                "upload_actor": _actor_snapshot(user),
            },
        )
        if version.storage_key != stored.storage_key:
            raise RuntimeError("document storage key and database version diverged")
        db.commit()
        committed = True
        db.refresh(document)
        db.refresh(version)
        return {
            "document": _document_payload(document),
            "version": _document_version_payload(version),
        }
    except HTTPException:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        raise
    except ValueError as exc:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        _raise_domain_error(exc)
    except IntegrityError as exc:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        raise HTTPException(
            status_code=409, detail="Dokumentversionen findes allerede."
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        raise HTTPException(
            status_code=503, detail="Dokumentet kunne ikke gemmes atomisk."
        ) from exc
    except Exception:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        raise
    finally:
        await file.close()


@router.get("/api/v3/documents/{document_id}/versions/{version_id}/download")
def download_document_version(
    document_id: str,
    version_id: str,
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> StreamingResponse:
    version = db.get(MunicipalDocumentVersion, version_id)
    if version is None or version.document_id != document_id:
        raise HTTPException(status_code=404, detail="Dokumentversionen findes ikke.")
    try:
        content = read_document_bytes(
            version.storage_key, expected_sha256=version.content_sha256
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=410, detail="Dokumentfilen er ikke længere tilgængelig."
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=503, detail="Dokumentfilens checksum stemmer ikke."
        ) from exc
    encoded_name = quote(version.original_filename, safe="")
    return StreamingResponse(
        BytesIO(content),
        media_type=version.media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
            "Content-Length": str(len(content)),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Content-SHA256": version.content_sha256,
        },
    )


@router.post("/api/v3/documents/{document_id}/versions/{version_id}/approve")
def approve_document(
    document_id: str,
    version_id: str,
    request: DocumentVersionApprovalRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(APPROVER_ACCESS),
) -> dict[str, Any]:
    version = db.get(MunicipalDocumentVersion, version_id)
    if version is None or version.document_id != document_id:
        raise HTTPException(status_code=404, detail="Dokumentversionen findes ikke.")
    try:
        version = approve_document_version(
            db,
            version_id,
            approved_by=_actor_name(user),
            approval_note=request.approval_note,
        )
        version.version_metadata = {
            **(version.version_metadata or {}),
            "approval_actor": _actor_snapshot(user),
        }
        db.commit()
        db.refresh(version)
        return _document_version_payload(version)
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Dokumentgodkendelsen kunne ikke gemmes."
        ) from exc


@router.post(
    "/api/v3/cases/{case_db_id}/documents/{document_id}",
    status_code=status.HTTP_201_CREATED,
)
def link_document(
    case_db_id: str,
    document_id: str,
    request: CaseDocumentLinkRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    try:
        link = link_document_to_case(
            db,
            case_db_id=case_db_id,
            document_id=document_id,
            document_version_id=request.document_version_id,
            link_role=request.link_role,
            note=request.note,
            linked_by=_actor_name(user),
            allow_unapproved=False,
        )
        db.commit()
        db.refresh(link)
        return link.to_dict()
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Dokumentet er allerede tilknyttet sagen."
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Dokumentet kunne ikke tilknyttes."
        ) from exc


@router.get("/api/v3/law/reassessments")
def get_reassessments(
    reassessment_status: ReassessmentStatus | None = Query(
        default=None, alias="status"
    ),
    source_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    try:
        rows = list_reassessments(
            db, status=reassessment_status, source_id=source_id, limit=limit
        )
    except ValueError as exc:
        _raise_domain_error(exc)
    return {
        "reassessments": [_reassessment_payload(row) for row in rows],
        "count": len(rows),
    }


@router.get("/api/v3/cases/{case_db_id}/reassessments")
def get_case_reassessments(
    case_db_id: str,
    reassessment_status: ReassessmentStatus | None = Query(
        default=None, alias="status"
    ),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    _get_case_or_404(db, case_db_id)
    rows = list_reassessments(
        db, case_db_id=case_db_id, status=reassessment_status, limit=limit
    )
    return {
        "reassessments": [_reassessment_payload(row) for row in rows],
        "count": len(rows),
    }


@router.patch("/api/v3/law/reassessments/{reassessment_id}")
def patch_reassessment(
    reassessment_id: str,
    request: ReassessmentUpdateRequest,
    db: Session = Depends(get_db),
    user: UserPrincipal = Depends(WORKSPACE_ACCESS),
) -> dict[str, Any]:
    if request.status == "dismissed" and not user.has_any_role(APPROVER_ROLES):
        raise HTTPException(
            status_code=403,
            detail="Kun Godkender, DPO eller Administrator kan afvise en genvurdering.",
        )
    try:
        reassessment = update_reassessment(
            db,
            reassessment_id,
            status=request.status,
            assigned_to=(
                request.assigned_to
                or (_actor_name(user) if request.status == "in_progress" else None)
            ),
            resolved_by=(
                _actor_name(user)
                if request.status in {"completed", "dismissed"}
                else None
            ),
            resolution_note=request.resolution_note,
        )
        db.commit()
        db.refresh(reassessment)
        return _reassessment_payload(reassessment)
    except ValueError as exc:
        db.rollback()
        _raise_domain_error(exc)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Genvurderingen kunne ikke opdateres."
        ) from exc


__all__ = [
    "APPROVER_ACCESS",
    "WORKSPACE_ACCESS",
    "router",
]
