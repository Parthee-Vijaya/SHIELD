"""Compact, read-only work queue over case facts, without per-case queries.

Counts cover the entire selected scope, including rows outside the display
limit. ``requires_action`` counts active cases with an unresolved assessment,
an open action/reassessment or an overdue case review. Drafts and pending
approvals alone are not action failures. Categories may overlap: an approval
can remain pending after a new substantive blocker appears.

``blockers_count`` counts one unresolved assessment gate plus individual
blocking actions and open legal reassessments. It is not a count of prose
bullets or of historical assessment versions. Approval requests are never
counted as blockers. Latest DPIA status is checked independently of the
coarse workflow/aggregate, so a later GO screening cannot hide a blocked DPIA.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

from sqlalchemy import case as sql_case, func
from sqlalchemy.orm import Session

from src.database.case_workspace import CaseAction, CaseApproval, CaseWorkspaceReference
from src.database.cases import CASE_STATUS_LABELS, Case
from src.database.case_visibility import visible_title
from src.database.dpia import DPIAAssessmentRecord
from src.database.legal_monitoring import CaseReassessment
from src.rule_engine.audit import V3AssessmentLog


Scope = Literal["all", "work", "examples"]
REVIEW_TIMEZONE = ZoneInfo("Europe/Copenhagen")
DPIA_STATUS_LABELS = {
    "blocked": "Blokeret",
    "requires_action": "Kræver handling",
    "ready_for_review": "Klar til faglig gennemgang",
}
ASSESSMENT_REFERENCE_TYPES = {
    "legal_screening",
    "dpia_assessment",
    "ai_act_assessment",
    "fria_assessment",
}


def _utc(value: datetime) -> datetime:
    # Historic SQLite timestamps have lost the timezone suffix; all writers use UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _iso(value: datetime | None) -> str | None:
    return _utc(value).isoformat() if value else None


def _is_example(case_id: str) -> bool:
    return case_id.startswith("EKSEMPEL-")


def _attention(
    kind: str, label: str, detail: str, tab: str, priority: int
) -> dict[str, Any]:
    return {
        "kind": kind,
        "label": label,
        "detail": detail,
        "tab": tab,
        "priority": priority,
    }


def build_case_overview(
    db: Session,
    *,
    scope: Scope = "all",
    limit: int = 500,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return metadata and complete-scope counters in seven SELECT queries.

    This endpoint grants no new approval authority; mutations still use the
    existing authenticated workflow gates. No full assessment, document,
    identity-token or approval-snapshot payload is loaded or returned.
    """
    if scope not in {"all", "work", "examples"} or not 1 <= limit <= 500:
        raise ValueError("invalid overview scope or limit")
    now = _utc(now or datetime.now(UTC))
    today = now.astimezone(REVIEW_TIMEZONE).date()
    horizon = today + timedelta(days=30)
    cases = (
        db.query(
            Case.id,
            Case.case_id,
            Case.title,
            Case.status,
            Case.assigned_to,
            Case.next_review_at,
            Case.updated_at,
            Case.last_aggregate_status,
            Case.last_assessment_log_id,
        )
        .filter(visible_title(Case.title))
        .all()
    )
    chosen = [
        item
        for item in cases
        if scope == "all" or (_is_example(item.case_id) == (scope == "examples"))
    ]
    chosen_ids = {item.id for item in chosen}

    actions = {
        item.case_db_id: item
        for item in db.query(
            CaseAction.case_db_id,
            func.count(CaseAction.id).label("open_count"),
            func.sum(
                sql_case(
                    (
                        (CaseAction.priority.in_(["high", "critical"]))
                        | (CaseAction.category == "condition"),
                        1,
                    ),
                    else_=0,
                )
            ).label("blocking_count"),
            func.min(CaseAction.due_at).label("next_due_at"),
        )
        .filter(CaseAction.status.in_(["open", "in_progress"]))
        .group_by(CaseAction.case_db_id)
        .all()
    }
    pending: dict[str, int] = {
        case_id: count
        for case_id, count in (
            db.query(CaseApproval.case_db_id, func.count(CaseApproval.id))
            .filter(CaseApproval.status == "pending")
            .group_by(CaseApproval.case_db_id)
            .all()
        )
    }
    reassessments: dict[str, int] = {
        case_id: count
        for case_id, count in (
            db.query(CaseReassessment.case_db_id, func.count(CaseReassessment.id))
            .filter(CaseReassessment.status.in_(["open", "in_progress"]))
            .group_by(CaseReassessment.case_db_id)
            .all()
        )
    }
    references: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for item in (
        db.query(
            CaseWorkspaceReference.case_db_id,
            CaseWorkspaceReference.reference_type,
            CaseWorkspaceReference.reference_id,
        )
        .filter(CaseWorkspaceReference.reference_type.in_(ASSESSMENT_REFERENCE_TYPES))
        .all()
    ):
        references[item.case_db_id][item.reference_type].add(item.reference_id)
    legal_ids: set[str] = set()
    legal_external_ids: set[str] = set()
    for legal in db.query(V3AssessmentLog.id, V3AssessmentLog.case_id).all():
        legal_ids.add(legal.id)
        if legal.case_id:
            legal_external_ids.add(legal.case_id)

    # Project only compact metadata, including department as a single JSON scalar.
    dpias = (
        db.query(
            DPIAAssessmentRecord.id,
            DPIAAssessmentRecord.case_db_id,
            DPIAAssessmentRecord.project_name,
            DPIAAssessmentRecord.version,
            DPIAAssessmentRecord.status,
            DPIAAssessmentRecord.risk_level,
            DPIAAssessmentRecord.created_at,
            DPIAAssessmentRecord.request_payload["department"]
            .as_string()
            .label("department"),
        )
        .filter(visible_title(DPIAAssessmentRecord.project_name))
        .order_by(
            DPIAAssessmentRecord.version.desc(),
            DPIAAssessmentRecord.created_at.desc(),
            DPIAAssessmentRecord.id,
        )
        .all()
    )
    latest_dpia: dict[str, dict[str, Any]] = {}
    recent: list[dict[str, Any]] = []
    for record in dpias:
        linked_id = record.case_db_id
        # Include unattached historic versions in all/work, but never infer an
        # example classification from a free-text project title.
        if linked_id not in chosen_ids and not (
            linked_id is None and scope != "examples"
        ):
            continue
        metadata = {
            "id": record.id,
            "case_db_id": linked_id,
            "project_name": record.project_name,
            "version": record.version,
            "status": record.status,
            "status_label": DPIA_STATUS_LABELS.get(
                record.status, "Status skal afklares"
            ),
            "risk_level": record.risk_level,
            "created_at": _iso(record.created_at),
            "department": (
                record.department if isinstance(record.department, str) else None
            ),
            "href": f"/vurdering?assessment_id={record.id}"
            + (f"&case={linked_id}" if linked_id else ""),
        }
        recent.append(metadata)
        if linked_id and linked_id not in latest_dpia:
            latest_dpia[linked_id] = metadata
    recent.sort(
        key=lambda item: (item["created_at"] or "", item["version"], item["id"]),
        reverse=True,
    )

    stats = dict.fromkeys(
        [
            "total",
            "active",
            "archived",
            "examples",
            "drafts",
            "approved",
            "in_operation",
            "requires_action",
            "awaiting_approval",
            "review_overdue",
            "review_due_soon",
        ],
        0,
    )
    rows: list[dict[str, Any]] = []
    for record in chosen:
        example = _is_example(record.case_id)
        archived = record.status == "arkiveret"
        latest = latest_dpia.get(record.id)
        refs = references.get(record.id, {})
        explicit_legal = set(refs.get("legal_screening", set()))
        if record.last_assessment_log_id:
            explicit_legal.add(record.last_assessment_log_id)
        has_legal = (
            bool(explicit_legal & legal_ids)
            if explicit_legal
            else record.case_id in legal_external_ids
        )
        has_assessment = bool(
            latest
            or has_legal
            or refs.get("ai_act_assessment")
            or refs.get("fria_assessment")
        )
        assessment_issue = has_assessment and (
            record.last_aggregate_status != "GO"
            or bool(latest and latest["status"] != "ready_for_review")
        )
        action = actions.get(record.id)
        open_count = int(action.open_count) if action else 0
        blocking_count = int(action.blocking_count) if action else 0
        pending_count = int(pending.get(record.id, 0))
        reassessment_count = int(reassessments.get(record.id, 0))
        blockers = int(assessment_issue) + blocking_count + reassessment_count
        # The UI chooses a Danish calendar date, not a time-of-day deadline.
        # Keep today's review planned until the next Copenhagen midnight.
        review_day = (
            _utc(record.next_review_at).astimezone(REVIEW_TIMEZONE).date()
            if record.next_review_at
            else None
        )
        overdue = bool(review_day and review_day < today)
        upcoming = bool(review_day and today <= review_day <= horizon)
        requires_action = bool(not archived and (blockers or open_count or overdue))

        if archived:
            attention = _attention(
                "archived",
                "Arkiveret",
                "Sagen er afsluttet og tæller ikke med i arbejdskøen.",
                "overview",
                100,
            )
        elif assessment_issue:
            attention = _attention(
                "requires_action",
                "Kræver handling",
                "Den aktuelle vurdering har uafklarede forhold. Gennemgå vurderingens blokeringer og manglende oplysninger.",
                "assessments",
                10,
            )
        elif reassessment_count:
            attention = _attention(
                "requires_action",
                "Genvurdering nødvendig",
                f"{reassessment_count} {'lovændring' if reassessment_count == 1 else 'lovændringer'} afventer genvurdering.",
                "overview",
                10,
            )
        elif blocking_count:
            attention = _attention(
                "requires_action",
                "Foranstaltninger mangler",
                (
                    "1 væsentlig foranstaltning eller ét vilkår er ikke afsluttet."
                    if blocking_count == 1
                    else f"{blocking_count} væsentlige foranstaltninger eller vilkår er ikke afsluttet."
                ),
                "measures",
                10,
            )
        elif overdue:
            attention = _attention(
                "review_due",
                "Reviewfristen er nået",
                "Gennemgå sagen, og dokumentér den næste beslutning.",
                "overview",
                15,
            )
        elif open_count:
            attention = _attention(
                "requires_action",
                "Åbne opgaver",
                (
                    "1 foranstaltning eller opfølgningsopgave er åben."
                    if open_count == 1
                    else f"{open_count} foranstaltninger eller opfølgningsopgaver er åbne."
                ),
                "measures",
                20,
            )
        elif pending_count:
            attention = _attention(
                "awaiting_approval",
                "Afventer godkendelse",
                f"{pending_count} {'godkendelsesanmodning' if pending_count == 1 else 'godkendelsesanmodninger'} afventer en begrundet beslutning.",
                "approvals",
                30,
            )
        elif upcoming:
            attention = _attention(
                "review_due",
                "Review inden for 30 dage",
                "Planlæg den kommende gennemgang af sagen.",
                "overview",
                40,
            )
        elif not has_assessment:
            attention = _attention(
                "draft",
                "Fortsæt kladden",
                "Start eller tilknyt en vurdering til sagen.",
                "assessments",
                60,
            )
        elif record.status == "godkendt":
            attention = _attention(
                "approved",
                "Godkendt",
                "Se den dokumenterede beslutning og næste skridt mod idriftsættelse.",
                "approvals",
                70,
            )
        elif record.status == "idriftsat":
            attention = _attention(
                "in_operation",
                "I drift",
                "Følg reviewdatoen og eventuelle ændringer i grundlaget.",
                "overview",
                80,
            )
        elif record.status in {"vurderet", "remediation"}:
            attention = _attention(
                "ready_for_approval",
                "Klar til at sende videre",
                "Send beslutningsgrundlaget til faglig godkendelse.",
                "approvals",
                50,
            )
        elif record.status == "kladde":
            attention = _attention(
                "draft",
                "Fortsæt kladden",
                "Gennemgå vurderingen og den aktuelle sagsstatus.",
                "assessments",
                60,
            )
        else:
            attention = _attention(
                "unknown",
                "Status skal afklares",
                "Åbn sagen for at kontrollere dens status og beslutningsgrundlag.",
                "overview",
                60,
            )

        stats["total"] += 1
        stats["archived" if archived else "active"] += 1
        stats["examples"] += int(example)
        stats["drafts"] += int(record.status == "kladde")
        stats["approved"] += int(record.status == "godkendt")
        stats["in_operation"] += int(record.status == "idriftsat")
        stats["requires_action"] += int(requires_action)
        stats["awaiting_approval"] += int(not archived and pending_count > 0)
        stats["review_overdue"] += int(not archived and overdue)
        stats["review_due_soon"] += int(not archived and upcoming)
        rows.append(
            {
                "id": record.id,
                "case_id": record.case_id,
                "title": record.title,
                "status": record.status,
                "status_label": CASE_STATUS_LABELS.get(record.status, record.status),
                "assigned_to": record.assigned_to,
                "next_review_at": _iso(record.next_review_at),
                "updated_at": _iso(record.updated_at),
                "is_example": example,
                "attention": attention,
                "blockers_count": blockers,
                "pending_approval_count": pending_count,
                "open_action_count": open_count,
                "latest_assessment": latest,
            }
        )
    # Stable, actionable first; then newest activity. ISO values are all UTC.
    rows.sort(key=lambda item: (item["updated_at"] or "", item["id"]), reverse=True)
    rows.sort(key=lambda item: item["attention"]["priority"])
    return {
        "scope": scope,
        "generated_at": _iso(now),
        "count": min(len(rows), limit),
        "total": len(rows),
        "limit": limit,
        "truncated": len(rows) > limit,
        "stats": stats,
        "items": rows[:limit],
        "latest_assessments": recent[:6],
    }
