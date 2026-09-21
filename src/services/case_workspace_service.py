"""Read model and export bundle for the unified municipal case workspace."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import json
from typing import Any

from sqlalchemy.orm import Session

from src.database.case_workspace import (
    list_case_actions,
    list_case_approvals,
    list_workspace_references,
)
from src.database.cases import get_case
from src.database.document_bank import list_case_documents
from src.database.dpia import DPIAAssessmentRecord, list_assessments_for_case
from src.database.procurement import (
    ProcurementProfile,
    ProcurementFactReview,
    ProcurementAnalysis,
)
from src.database.technical_controls import (
    TechnicalControlPoint,
    TechnicalControlPointRevision,
)
from src.services.law_change_impact import (
    list_case_legal_dependencies,
    list_reassessments,
)
from src.rule_engine.audit import V3AssessmentLog


WORKSPACE_SCHEMA_VERSION = "1.1"
CATEGORY_LABELS = {
    "dpia_assessment": "Konsekvensanalyse og risikovurdering",
    "legal_screening": "Juridisk screening",
    "ai_act_assessment": "AI Act-vurdering",
    "fria_assessment": "Grundrettighedsvurdering",
    "procurement_review": "Juridisk dialoggrundlag",
    "case_bundle": "Samlet sagspakke",
}


def _mapping(value) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _actor_kind(actor: str | None, *, authenticated: bool = False) -> str:
    # A historic label does not establish a human identity or model version.
    if actor == "Codex":
        return "ai"
    if (actor or "").strip().lower() in {
        "system",
        "systemet",
        "api",
        "rule_engine",
        "regelbaseret",
    }:
        return "system"
    return "human" if actor and authenticated else "unknown"


def _human_control_payloads(session: Session, case_db_id: str) -> list[dict[str, Any]]:
    """Export registered human follow-up independently of locked AI/JEV results."""
    records = (
        session.query(TechnicalControlPoint)
        .filter_by(case_db_id=case_db_id)
        .order_by(TechnicalControlPoint.created_at, TechnicalControlPoint.id)
        .all()
    )
    identifiers = [record.id for record in records]
    revisions = (
        session.query(TechnicalControlPointRevision)
        .filter(TechnicalControlPointRevision.control_point_id.in_(identifiers))
        .order_by(TechnicalControlPointRevision.version.desc())
        .all()
        if identifiers
        else []
    )
    history: dict[str, list[dict[str, Any]]] = {}
    for revision in revisions:
        history.setdefault(str(revision.control_point_id), []).append(
            {
                "id": revision.id,
                "version": revision.version,
                "action": revision.action,
                "snapshot": revision.snapshot,
                "actor_id": revision.actor_id,
                "actor_name": revision.actor_name,
                "identity_assurance": revision.identity_assurance,
                "created_at": revision.created_at.isoformat(),
            }
        )
    return [
        {
            "id": record.id,
            "case_id": record.case_db_id,
            "assessment_id": record.assessment_id,
            "original_check_id": record.original_check_id,
            "question": record.question,
            "notes": record.notes,
            "owner": record.owner,
            "status": record.status,
            "version": record.version,
            "created_at": record.created_at.isoformat(),
            "updated_at": record.updated_at.isoformat(),
            "origin": "human",
            "jev_reviewed": False,
            "requires_new_review": True,
            "history": history.get(str(record.id), []),
        }
        for record in records
    ]


def _assessment_metadata(
    payload, *, reference=None, result=None, default_kind="unknown", actor_id=None
):
    result = _mapping(result)
    details = _mapping(reference.details) if reference else {}
    metadata = _mapping(details.get("workspace_metadata"))
    editorial = _mapping(result.get("editorial_revision"))
    generation = _mapping(result.get("ai_generation"))
    model_info = _mapping(result.get("model_info"))
    actor = _mapping(details.get("actor"))
    creator = editorial.get("edited_by") or (
        reference.created_by if reference and not details.get("metadata_only") else None
    )
    recorded_model = generation.get("model") or model_info.get("model")
    kind = (
        "human_edited"
        if editorial
        else "ai_assisted" if recorded_model or creator == "Codex" else default_kind
    )
    identifier = payload.get("reference_id") or payload["id"]
    version = payload.get("version")
    version_kind = "number" if version is not None else "snapshot_id"
    if version is None:
        version = str(identifier)[:8]
    payload.update(
        {
            "assessment_id": identifier,
            "category": payload["type"],
            "category_label": CATEGORY_LABELS.get(payload["type"], payload["type"]),
            "owner": metadata.get("owner"),
            "metadata_updated_at": metadata.get("updated_at"),
            "owner_assignment_kind": metadata.get("updated_by_kind"),
            "owner_assignment_model": metadata.get("updated_by_model"),
            "created_by": creator,
            "created_by_id": editorial.get("actor_id") or actor.get("oid") or actor_id,
            "created_by_kind": _actor_kind(
                creator,
                authenticated=bool(editorial.get("actor_id") or actor.get("oid")),
            ),
            "generation_kind": kind,
            "model": None if editorial else recorded_model,
            "source_ai_model": recorded_model if editorial else None,
            "ai_generated_at": generation.get("generated_at"),
            "human_edited_at": editorial.get("edited_at"),
            "version": version,
            "version_kind": version_kind,
            "version_label": (
                f"Version {version}"
                if version_kind == "number"
                else f"Snapshot {version}"
            ),
        }
    )
    return payload


def _mark_latest(items):
    for index, item in enumerate(items):
        item["is_latest"] = index == 0
    return items


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
    document = _mapping(payload.get("document"))
    payload.update(
        {
            "category": document.get("category"),
            "uploaded_at": (
                version.get("created_at") if isinstance(version, dict) else None
            ),
            "uploaded_by": (
                version.get("uploaded_by") if isinstance(version, dict) else None
            ),
            "uploaded_actor_kind": (
                _actor_kind(
                    version.get("uploaded_by"),
                    authenticated=bool(
                        _mapping(
                            _mapping(version.get("metadata")).get("upload_actor")
                        ).get("oid")
                    ),
                )
                if isinstance(version, dict)
                else "unknown"
            ),
            "uploaded_model": (
                _mapping(version.get("metadata")).get("model")
                if isinstance(version, dict)
                else None
            ),
        }
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
    actions,
    approvals,
    document_links,
    reassessments,
    assessments,
    analyses,
    reviews,
    human_controls,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    def append(identifier, kind, when, title, actor=None, payload=None, **metadata):
        if not when:
            return
        events.append(
            {
                "id": identifier,
                "event_type": kind,
                "occurred_at": when.isoformat() if isinstance(when, datetime) else when,
                "title": title,
                "actor": actor,
                "actor_id": None,
                "actor_kind": _actor_kind(actor),
                "model": None,
                "payload": payload or {},
                **metadata,
            }
        )

    for transition in case.transitions:
        append(
            transition.id,
            "status_changed",
            transition.changed_at,
            f"Status: {transition.to_status}",
            transition.changed_by,
            transition.to_dict(),
        )
    assessment_ids = {item["assessment_id"] for item in assessments}
    tracked_status_actions = set()
    for reference in references:
        details = _mapping(reference.details)
        audit = _mapping(details.get("workspace_event"))
        if audit:
            if audit.get("target_type") == "measure" and "status" in audit.get(
                "after", {}
            ):
                tracked_status_actions.add(audit.get("target_id"))
            append(
                reference.id,
                audit["event_type"],
                reference.created_at,
                reference.title,
                reference.created_by,
                reference.to_dict(),
                actor_id=audit.get("actor_id"),
                actor_kind=audit.get("actor_kind", "unknown"),
                model=audit.get("model"),
                before=audit.get("before", {}),
                after=audit.get("after", {}),
                target_type=audit.get("target_type"),
                target_id=audit.get("target_id"),
            )
        elif (
            not details.get("metadata_only")
            and reference.reference_id not in assessment_ids
        ):
            append(
                reference.id,
                "reference_added",
                reference.created_at,
                reference.title or reference.reference_type,
                reference.created_by,
                reference.to_dict(),
            )
    for item in assessments:
        ai = item["generation_kind"] == "ai_assisted"
        human_edit = item["generation_kind"] == "human_edited"
        append(
            f"assessment:{item['category']}:{item['assessment_id']}",
            (
                "assessment_ai_generated"
                if ai
                else "assessment_human_edited" if human_edit else "assessment_created"
            ),
            item["created_at"],
            f"{item['category_label']} · {item['version_label']}",
            None if ai else item["created_by"],
            {
                key: item.get(key)
                for key in (
                    "assessment_id",
                    "category",
                    "version",
                    "version_label",
                    "generation_kind",
                    "owner",
                    "href",
                )
            },
            actor_id=None if ai else item["created_by_id"],
            actor_kind="ai" if ai else item["created_by_kind"],
            model=item["model"],
            initiated_by=item["created_by"] if ai else None,
            initiated_by_id=item["created_by_id"] if ai else None,
        )
    for action in actions:
        append(
            f"measure-created:{action.id}",
            "measure_added",
            action.created_at,
            action.title,
            action.created_by,
            action.to_dict(),
        )
        if action.completed_at and action.id not in tracked_status_actions:
            append(
                f"measure-completed:{action.id}",
                "measure_completed",
                action.completed_at,
                action.title,
                None,
                action.to_dict(),
            )
    for approval in approvals:
        append(
            f"approval-requested:{approval.id}",
            "approval_requested",
            approval.requested_at,
            "Godkendelse anmodet",
            approval.requested_by,
            approval.to_dict(),
        )
        if approval.decided_at:
            append(
                f"approval-decided:{approval.id}",
                "approval_decided",
                approval.decided_at,
                f"Godkendelse: {approval.status}",
                approval.decided_by,
                approval.to_dict(),
                actor_id=approval.actor_oid,
                actor_kind=_actor_kind(
                    approval.decided_by, authenticated=bool(approval.actor_oid)
                ),
            )
    seen_versions = set()
    for link in document_links:
        payload = _document_link_payload(link)
        title = link.document.title if link.document else "Dokument"
        if link.version and link.document_version_id not in seen_versions:
            seen_versions.add(link.document_version_id)
            append(
                f"document-uploaded:{link.document_version_id}",
                "document_uploaded",
                link.version.created_at,
                title,
                link.version.uploaded_by,
                payload,
                model=_mapping(link.version.version_metadata).get("model"),
                actor_kind=payload["uploaded_actor_kind"],
                actor_id=_mapping(
                    _mapping(link.version.version_metadata).get("upload_actor")
                ).get("oid"),
            )
        append(
            link.id, "document_linked", link.linked_at, title, link.linked_by, payload
        )
    for analysis in analyses:
        append(
            f"material-analysis:{analysis.id}",
            "material_ai_generated",
            analysis.created_at,
            "AI har analyseret sagens materiale",
            None,
            {"analysis_id": analysis.id, "status": analysis.status},
            actor_kind="ai",
            model=analysis.model,
        )
    for review in reviews:
        append(
            f"material-review:{review.id}",
            "material_reviewed",
            review.created_at,
            "Materialets oplysninger gennemgået",
            None,
            {"review_id": review.id, "analysis_id": review.analysis_id},
            actor_id=review.reviewed_by,
            actor_kind="human",
        )
    for control in human_controls:
        previous: dict[str, Any] = {}
        for revision in reversed(control["history"]):
            created = revision["action"] == "created"
            snapshot = _mapping(revision["snapshot"])
            append(
                f"human-control:{revision['id']}",
                "human_control_created" if created else "human_control_updated",
                revision["created_at"],
                (
                    "Menneskelig opfølgning oprettet"
                    if created
                    else "Menneskelig opfølgning opdateret"
                )
                + f" · version {revision['version']}",
                revision["actor_name"],
                {
                    "control_point_id": control["id"],
                    "assessment_id": control["assessment_id"],
                    "original_check_id": control["original_check_id"],
                    "version": revision["version"],
                    "origin": "human",
                    "jev_reviewed": False,
                    "requires_new_review": True,
                    "identity_assurance": revision["identity_assurance"],
                },
                actor_id=revision["actor_id"],
                actor_kind="human",
                before=previous,
                after=snapshot,
                target_type="human_control",
                target_id=control["id"],
            )
            previous = snapshot
    for reassessment in reassessments:
        append(
            f"reassessment-created:{reassessment.id}",
            "legal_reassessment_created",
            reassessment.created_at,
            "Genvurdering efter lovændring",
            None,
            reassessment.to_dict(),
            actor_kind="system",
        )
        if reassessment.resolved_at:
            append(
                f"reassessment-resolved:{reassessment.id}",
                "legal_reassessment_resolved",
                reassessment.resolved_at,
                "Genvurdering afsluttet",
                reassessment.resolved_by,
                reassessment.to_dict(),
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
    profile = session.get(ProcurementProfile, case.id)
    reviews = (
        session.query(ProcurementFactReview)
        .filter_by(case_id=case.id)
        .order_by(ProcurementFactReview.created_at.desc())
        .all()
    )
    analyses = (
        session.query(ProcurementAnalysis)
        .filter_by(case_id=case.id)
        .order_by(ProcurementAnalysis.created_at.desc())
        .all()
    )
    reference_map = {
        (str(item.reference_type), str(item.reference_id)): item for item in references
    }
    dpia = _mark_latest(
        [
            _assessment_metadata(
                _dpia_payload(item, full=include_assessment_payloads),
                reference=reference_map.get(("dpia_assessment", item.id)),
                result=item.result_payload,
                default_kind="rule_based",
            )
            for item in dpia_records
        ]
    )
    legal = _mark_latest(
        [
            _assessment_metadata(
                _v3_payload(item, full=include_assessment_payloads),
                reference=reference_map.get(("legal_screening", str(item.id))),
                result=item.response_payload,
                default_kind="rule_based",
                actor_id=item.user_id,
            )
            for item in v3_records
        ]
    )

    def referenced_payload(item):
        payload = {**item.to_dict(), "type": item.reference_type}
        return _assessment_metadata(
            payload,
            reference=item,
            result=_mapping(item.details).get("result"),
            default_kind="rule_based",
        )

    ai_act = _mark_latest([referenced_payload(item) for item in ai_act_references])
    fria = _mark_latest([referenced_payload(item) for item in fria_references])
    all_assessments = dpia + legal + ai_act + fria
    human_controls = _human_control_payloads(session, case_db_id)
    timeline = _timeline(
        case,
        references,
        actions,
        approvals,
        document_links,
        reassessments,
        all_assessments,
        analyses,
        reviews,
        human_controls,
    )
    has_assessment = bool(all_assessments)
    exports = []
    for item in dpia:
        for format_ in ("docx", "xlsx"):
            exports.append(
                {
                    key: item.get(key)
                    for key in (
                        "assessment_id",
                        "category",
                        "category_label",
                        "owner",
                        "created_by",
                        "created_by_id",
                        "generation_kind",
                        "model",
                        "source_ai_model",
                        "owner_assignment_kind",
                        "owner_assignment_model",
                        "created_at",
                        "version",
                        "version_label",
                        "version_kind",
                        "is_latest",
                    )
                }
            )
            exports[-1].update(
                {
                    "type": f"dpia_{format_}",
                    "format": format_,
                    "group_id": f"dpia:{item['id']}",
                    "title": f"DPIA og risikovurdering – {item['project_name']} · {item['version_label']}",
                    "href": f"/api/dpia/assessments/{item['id']}/export.{format_}",
                }
            )
    for index, review in enumerate(reviews):
        snapshot = str(review.id)[:8]
        exports.append(
            {
                "type": "procurement_review",
                "format": "docx",
                "review_id": review.id,
                "assessment_id": review.id,
                "group_id": f"procurement-review:{review.id}",
                "category": "procurement_review",
                "category_label": CATEGORY_LABELS["procurement_review"],
                "version": snapshot,
                "version_kind": "snapshot_id",
                "version_label": f"Snapshot {snapshot}",
                "created_at": review.created_at.isoformat(),
                "created_by": None,
                "created_by_id": review.reviewed_by,
                "generation_kind": "human_edited",
                "model": None,
                "owner": None,
                "is_latest": index == 0,
                "title": f"Juridisk dialoggrundlag – {case.title} · snapshot {snapshot}",
                "href": f"/api/v3/cases/{case.id}/procurement/reviews/{review.id}/export.docx",
            }
        )
    exports.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    documents = [_document_link_payload(item) for item in document_links]
    owner_events: dict[str, tuple[Any, dict[str, Any]]] = {}
    for reference in references:
        audit = _mapping(_mapping(reference.details).get("workspace_event"))
        target_id = audit.get("target_id")
        if (
            isinstance(target_id, str)
            and audit.get("target_type") == "measure"
            and "owner" in audit.get("after", {})
        ):
            owner_events.setdefault(target_id, (reference, audit))
    measures = []
    for action in actions:
        payload = action.to_dict()
        assignment = owner_events.get(str(action.id))
        owner_reference, owner_audit = assignment if assignment else (None, {})
        payload.update(
            {
                "owner_assignment_kind": owner_audit.get("actor_kind"),
                "owner_assignment_model": owner_audit.get("model"),
                "owner_assignment_by": (
                    owner_reference.created_by if owner_reference else None
                ),
                "owner_assignment_at": (
                    owner_reference.created_at.isoformat() if owner_reference else None
                ),
            }
        )
        measures.append(payload)
    result: dict[str, Any] = {
        "schema_version": WORKSPACE_SCHEMA_VERSION,
        "procurement": profile.to_dict() if profile else None,
        "case": case.to_dict(),
        "assessments": {
            "dpia": dpia,
            "legal_screening": legal,
            "ai_act": ai_act,
            "fria": fria,
            "references": [item.to_dict() for item in references],
        },
        "documents": documents,
        "measures": measures,
        "human_controls": human_controls,
        "approvals": [item.to_dict() for item in approvals],
        "legal_dependencies": [item.to_dict() for item in dependencies],
        "reassessments": [item.to_dict() for item in reassessments],
        "timeline": timeline,
        "readiness": _readiness(
            case,
            has_assessment=has_assessment,
            actions=actions,
            approvals=approvals,
            reassessments=reassessments,
        ),
    }
    # Same content revision for compact UI and complete download; never a fake
    # historical sequence or timestamp generated merely by viewing the case.
    manifest = {
        **result,
        "assessments": {
            "versions": [
                {
                    key: item.get(key)
                    for key in (
                        "assessment_id",
                        "category",
                        "version",
                        "owner",
                        "metadata_updated_at",
                        "created_at",
                        "updated_at",
                    )
                }
                for item in all_assessments
            ],
            "references": result["assessments"]["references"],
        },
        "exports": exports,
    }
    revision = sha256(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, default=str).encode()
    ).hexdigest()[:12]
    result["revision_id"] = revision
    result["exports"] = exports + [
        {
            "type": "case_bundle",
            "format": "json",
            "case_db_id": case.id,
            "group_id": f"case-bundle:{case.id}",
            "category": "case_bundle",
            "category_label": CATEGORY_LABELS["case_bundle"],
            "version": revision,
            "revision_id": revision,
            "version_kind": "content_revision",
            "version_label": f"Sagsrevision {revision}",
            "is_latest": True,
            "is_live_bundle": True,
            "created_at": None,
            "created_by": None,
            "generation_kind": "unknown",
            "owner": None,
            "model": None,
            "title": f"Komplet sagspakke · sagsrevision {revision}",
            "href": f"/api/v3/cases/{case.id}/export.json",
        }
    ]
    return result


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
