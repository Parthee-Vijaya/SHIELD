"""Read model and export bundle for the unified municipal case workspace."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.database.case_workspace import (
    CaseAction,
    CaseApproval,
    list_case_actions,
    list_case_approvals,
    list_workspace_references,
)
from src.database.cases import get_case
from src.database.document_bank import list_case_documents
from src.database.dpia import DPIAAssessmentRecord, list_assessments_for_case
from src.database.procurement import ProcurementProfile, ProcurementFactReview
from src.services.law_change_impact import (
    list_case_legal_dependencies,
    list_reassessments,
)
from src.rule_engine.audit import V3AssessmentLog


WORKSPACE_SCHEMA_VERSION = "1.0"


def _dpia_payload(record: DPIAAssessmentRecord, *, full: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": record.id,
        "type": "dpia_assessment",
        "case_db_id": record.case_db_id,
        "project_name": record.project_name,
        "organisation": record.organisation,
        "status": record.status,
        "risk_level": record.risk_level,
        "template_version": record.template_version,
        "version": record.version,
        "parent_assessment_id": record.result_payload.get("parent_assessment_id"),
        "ai_generation": record.result_payload.get("ai_generation"),
        "href": f"/vurdering?assessment_id={record.id}&case={record.case_db_id or ''}",
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }
    if full:
        payload["request_payload"] = record.request_payload
        payload["result_payload"] = record.result_payload
    return payload


def _v3_payload(record: V3AssessmentLog, *, full: bool) -> dict[str, Any]:
    payload = record.to_full_dict() if full else record.to_dict()
    payload["type"] = "legal_screening"
    return payload


def _document_link_payload(link) -> dict[str, Any]:
    """Expose immutable document metadata without leaking server storage keys."""

    payload = link.to_dict()
    version = payload.get("version")
    if isinstance(version, dict):
        version.pop("storage_key", None)
        version["download_href"] = (
            f"/api/v3/documents/{link.document_id}/versions/"
            f"{link.document_version_id}/download"
        )
    return payload


def _linked_v3_assessments(
    session: Session,
    *,
    external_case_id: str,
    last_assessment_log_id: str | None,
    reference_ids: set[str],
) -> list[V3AssessmentLog]:
    explicit_ids = set(reference_ids)
    if last_assessment_log_id:
        explicit_ids.add(last_assessment_log_id)
    query = session.query(V3AssessmentLog)
    if explicit_ids:
        rows = query.filter(V3AssessmentLog.id.in_(explicit_ids)).all()
    else:
        # Backward-compatible fallback for assessments created before the
        # workspace reference table. Explicit references always win because
        # external case IDs are not guaranteed unique after a case is split.
        rows = query.filter(V3AssessmentLog.case_id == external_case_id).all()
    return sorted(rows, key=lambda item: item.created_at, reverse=True)


def _timeline(
    case,
    references,
    actions: list[CaseAction],
    approvals: list[CaseApproval],
    document_links,
    reassessments,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for transition in case.transitions:
        events.append(
            {
                "id": transition.id,
                "event_type": "status_changed",
                "occurred_at": transition.changed_at.isoformat(),
                "title": f"Status: {transition.to_status}",
                "actor": transition.changed_by,
                "payload": transition.to_dict(),
            }
        )
    for reference in references:
        events.append(
            {
                "id": reference.id,
                "event_type": "reference_added",
                "occurred_at": reference.created_at.isoformat(),
                "title": reference.title or reference.reference_type,
                "actor": reference.created_by,
                "payload": reference.to_dict(),
            }
        )
    for action in actions:
        events.append(
            {
                "id": action.id,
                "event_type": (
                    "measure_completed"
                    if action.status == "completed"
                    else "measure_added"
                ),
                "occurred_at": (action.completed_at or action.created_at).isoformat(),
                "title": action.title,
                "actor": action.owner or action.created_by,
                "payload": action.to_dict(),
            }
        )
    for approval in approvals:
        events.append(
            {
                "id": approval.id,
                "event_type": (
                    "approval_decided" if approval.decided_at else "approval_requested"
                ),
                "occurred_at": (
                    approval.decided_at or approval.requested_at
                ).isoformat(),
                "title": f"Godkendelse: {approval.status}",
                "actor": approval.decided_by or approval.requested_by,
                "payload": approval.to_dict(),
            }
        )
    for link in document_links:
        events.append(
            {
                "id": link.id,
                "event_type": "document_linked",
                "occurred_at": link.linked_at.isoformat(),
                "title": (
                    link.document.title if link.document else "Dokument tilknyttet"
                ),
                "actor": link.linked_by,
                "payload": _document_link_payload(link),
            }
        )
    for reassessment in reassessments:
        events.append(
            {
                "id": reassessment.id,
                "event_type": (
                    "legal_reassessment_resolved"
                    if reassessment.resolved_at
                    else "legal_reassessment_created"
                ),
                "occurred_at": (
                    reassessment.resolved_at or reassessment.created_at
                ).isoformat(),
                "title": "Genvurdering efter lovændring",
                "actor": reassessment.resolved_by or reassessment.assigned_to,
                "payload": reassessment.to_dict(),
            }
        )
    return sorted(events, key=lambda item: item["occurred_at"], reverse=True)


def _readiness(
    case, *, has_assessment: bool, actions, approvals, reassessments
) -> dict[str, Any]:
    open_actions = [item for item in actions if item.status in {"open", "in_progress"}]
    blocking_actions = [
        item
        for item in open_actions
        if item.priority in {"high", "critical"} or item.category == "condition"
    ]
    open_reassessments = [
        item for item in reassessments if item.status in {"open", "in_progress"}
    ]
    pending_approvals = [item for item in approvals if item.status == "pending"]
    assessment_clear = case.last_aggregate_status == "GO"
    blockers: list[str] = []
    if not has_assessment:
        blockers.append("Sagen har endnu ingen tilknyttet vurdering.")
    elif not assessment_clear:
        blockers.append("Seneste juridiske vurdering er ikke uden blokeringer.")
    if blocking_actions:
        blockers.append(
            f"{len(blocking_actions)} væsentlige foranstaltninger er ikke afsluttet."
        )
    if open_reassessments:
        blockers.append(
            f"{len(open_reassessments)} lovændringer afventer genvurdering."
        )
    if pending_approvals:
        blockers.append("Der findes allerede en afventende godkendelse.")
    substantive_blockers = bool(blocking_actions or open_reassessments)
    can_request = (
        has_assessment
        and assessment_clear
        and not substantive_blockers
        and not pending_approvals
    )
    can_approve = (
        bool(pending_approvals)
        and assessment_clear
        and not substantive_blockers
        and case.status in {"vurderet", "remediation"}
    )
    decided_approvals = [
        item
        for item in approvals
        if item.status not in {"pending", "rejected", "changes_requested"}
    ]
    progress = 0
    if has_assessment:
        progress += 35
        progress += 20 if assessment_clear else 0
        progress += 15 if not blocking_actions else 0
        progress += 15 if not open_reassessments else 0
        progress += (
            15
            if decided_approvals or case.status in {"godkendt", "idriftsat"}
            else (7 if pending_approvals else 0)
        )

    if not has_assessment:
        next_action = "Start og tilknyt mindst én vurdering til sagen."
    elif not assessment_clear:
        next_action = "Afklar blokeringerne i den seneste juridiske vurdering."
    elif blocking_actions:
        next_action = "Afslut de væsentlige foranstaltninger og vedhæft evidens."
    elif open_reassessments:
        next_action = "Gennemfør genvurderingen efter den registrerede lovændring."
    elif pending_approvals:
        next_action = "Sagen afventer en begrundet beslutning fra en godkender."
    elif case.status == "godkendt":
        next_action = (
            "Den godkendte sag kan nu anmodes om godkendelse til idriftsættelse."
        )
    elif case.status == "idriftsat":
        next_action = "Følg næste reviewdato og nye lovændringer."
    else:
        next_action = "Send det låste beslutningsgrundlag til godkendelse."

    return {
        "has_assessment": has_assessment,
        "assessment_clear": assessment_clear,
        "open_measure_count": len(open_actions),
        "blocking_measure_count": len(blocking_actions),
        "open_reassessment_count": len(open_reassessments),
        "pending_approval_count": len(pending_approvals),
        "can_request_approval": can_request,
        "can_approve": can_approve,
        "can_deploy": (
            case.status == "godkendt" and assessment_clear and not substantive_blockers
        ),
        "ready": can_request or can_approve,
        "percent": min(progress, 100),
        "next_action": next_action,
        "blockers": blockers,
    }


def build_case_workspace(
    session: Session,
    case_db_id: str,
    *,
    include_assessment_payloads: bool = False,
) -> dict[str, Any]:
    """Build the endpoint-facing, JSON-serializable workspace read model."""

    case = get_case(session, case_db_id)
    if case is None:
        raise ValueError(f"case not found: {case_db_id}")
    references = list_workspace_references(session, case_db_id)
    ai_act_references = [
        item for item in references if item.reference_type == "ai_act_assessment"
    ]
    fria_references = [
        item for item in references if item.reference_type == "fria_assessment"
    ]
    legal_reference_ids = {
        item.reference_id
        for item in references
        if item.reference_type == "legal_screening"
    }
    dpia_records = list_assessments_for_case(session, case_db_id)
    v3_records = _linked_v3_assessments(
        session,
        external_case_id=case.case_id,
        last_assessment_log_id=case.last_assessment_log_id,
        reference_ids=legal_reference_ids,
    )
    actions = list_case_actions(session, case_db_id)
    approvals = list_case_approvals(session, case_db_id)
    document_links = list_case_documents(session, case_db_id)
    dependencies = list_case_legal_dependencies(session, case_db_id)
    reassessments = list_reassessments(session, case_db_id=case_db_id)
    timeline = _timeline(
        case,
        references,
        actions,
        approvals,
        document_links,
        reassessments,
    )
    has_assessment = bool(
        dpia_records or v3_records or ai_act_references or fria_references
    )
    exports = [
        {
            "type": "dpia_xlsx",
            "format": "xlsx",
            "assessment_id": record.id,
            "title": f"DPIA – {record.project_name}",
            "href": f"/api/dpia/assessments/{record.id}/export.xlsx",
        }
        for record in dpia_records
    ]
    exports.extend(
        {
            "type": "dpia_docx",
            "format": "docx",
            "assessment_id": record.id,
            "title": f"DPIA og risikovurdering – {record.project_name} · version {record.version}",
            "href": f"/api/dpia/assessments/{record.id}/export.docx",
        }
        for record in dpia_records
    )
    exports.append(
        {
            "type": "case_bundle",
            "format": "json",
            "case_db_id": case.id,
            "title": "Komplet sagspakke",
            "href": f"/api/v3/cases/{case.id}/export.json",
        }
    )
    profile = session.get(ProcurementProfile, case.id)
    reviews = (
        session.query(ProcurementFactReview)
        .filter_by(case_id=case.id)
        .order_by(ProcurementFactReview.created_at.desc())
        .all()
    )
    exports.extend(
        {
            "type": "procurement_review",
            "format": "docx",
            "title": f"Juridisk dialoggrundlag – {case.title} · {review.created_at.date()}",
            "href": f"/api/v3/cases/{case.id}/procurement/reviews/{review.id}/export.docx",
        }
        for review in reviews
    )
    return {
        "schema_version": WORKSPACE_SCHEMA_VERSION,
        "procurement": profile.to_dict() if profile else None,
        "case": case.to_dict(),
        "assessments": {
            "dpia": [
                _dpia_payload(item, full=include_assessment_payloads)
                for item in dpia_records
            ],
            "legal_screening": [
                _v3_payload(item, full=include_assessment_payloads)
                for item in v3_records
            ],
            "ai_act": [item.to_dict() for item in ai_act_references],
            "fria": [item.to_dict() for item in fria_references],
            "references": [item.to_dict() for item in references],
        },
        "documents": [_document_link_payload(item) for item in document_links],
        "measures": [item.to_dict() for item in actions],
        "approvals": [item.to_dict() for item in approvals],
        "legal_dependencies": [item.to_dict() for item in dependencies],
        "reassessments": [item.to_dict() for item in reassessments],
        "timeline": timeline,
        "exports": exports,
        "readiness": _readiness(
            case,
            has_assessment=has_assessment,
            actions=actions,
            approvals=approvals,
            reassessments=reassessments,
        ),
    }


def build_case_export_bundle(session: Session, case_db_id: str) -> dict[str, Any]:
    """Return a complete JSON export; no HTTP or filesystem side effects."""

    bundle = build_case_workspace(
        session,
        case_db_id,
        include_assessment_payloads=True,
    )
    bundle["exported_at"] = datetime.now(UTC).isoformat()
    bundle["export_format"] = "shield-case-bundle-v1"
    return bundle
