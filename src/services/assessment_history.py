"""Compact, read-only assessment history, paginated by stable version lineage.

Only metadata scalars are selected; full reports, prompts and source material
never cross this endpoint. Case/category is the version boundary. Unattached
snapshots are related only by explicit parent IDs, never by a matching title.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy.orm import Session

from src.database.cases import Case
from src.database.case_visibility import visible_title
from src.database.case_workspace import CaseWorkspaceReference
from src.database.dpia import DPIAAssessmentRecord
from src.rule_engine.audit import V3AssessmentLog

CATEGORIES = {
    "dpia": "Konsekvensanalyse og risikovurdering",
    "legal_screening": "Juridisk screening",
    "ai_act": "AI Act-vurdering",
    "fria": "Grundrettighedsvurdering",
}
REFERENCE_CATEGORIES = {
    "dpia_assessment": "dpia",
    "legal_screening": "legal_screening",
    "ai_act_assessment": "ai_act",
    "fria_assessment": "fria",
}
STATUS_LABELS = {
    "blocked": "Blokeret",
    "requires_action": "Kræver handling",
    "ready_for_review": "Klar til faglig gennemgang",
    "ready_for_legal_review": "Klar til juridisk gennemgang",
    "ready_for_human_decision": "Klar til menneskelig beslutning",
    "GO": "Ingen blokeringer",
    "BETINGET-GO": "Kræver handling",
    "NO-GO": "Blokeret",
    "NEEDS_INPUT": "Mangler oplysninger",
}


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _iso(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return (
        value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    ).isoformat()


def _version_key(item):
    value = item.get("version")
    try:
        number = float(value) if value is not None else -1
    except (TypeError, ValueError):
        number = -1
    return (item.get("created_at") or "", number, item["id"])


def group_history(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {(item["category"], item["id"]): item for item in items}
    groups = defaultdict(list)
    for item in items:
        category = item["category"]
        case_id = item.get("case_db_id")
        external = item.get("case_id")
        if case_id:
            identity = f"case:{case_id}"
        elif external:
            identity = f"external-case:{external}"
        else:
            current = item
            seen = set()
            while current.get("parent_assessment_id"):
                seen.add(current["id"])
                parent = current["parent_assessment_id"]
                if parent in seen:
                    identity = f"lineage:{min(seen)}"
                    break
                candidate = by_id.get((category, parent))
                if (
                    candidate is None
                    or candidate.get("case_db_id")
                    or candidate.get("case_id")
                ):
                    identity = f"lineage:{parent}"
                    break
                current = candidate
            else:
                identity = f"lineage:{current['id']}"
        groups[(category, identity)].append(item)
    result = []
    for (category, identity), entries in groups.items():
        ordered = sorted(entries, key=_version_key, reverse=True)
        latest = {**ordered[0], "is_latest": True}
        result.append(
            {
                "id": f"{category}:{identity}",
                "category": category,
                "category_label": CATEGORIES.get(category, category),
                "latest": latest,
                "version_count": len(ordered),
                "older_versions": [
                    {**item, "is_latest": False} for item in ordered[1:]
                ],
            }
        )
    return sorted(
        result,
        key=lambda group: (group["latest"].get("created_at") or "", group["id"]),
        reverse=True,
    )


def history_metadata(db: Session) -> list[dict[str, Any]]:
    cases = {
        row.id: row
        for row in db.query(
            Case.id,
            Case.case_id,
            Case.title,
            Case.assigned_to,
            Case.created_at,
            visible_title(Case.title).label("visible"),
        ).all()
    }
    external_cases = {row.case_id: row for row in cases.values()}
    refs = (
        db.query(
            CaseWorkspaceReference.case_db_id,
            CaseWorkspaceReference.reference_type,
            CaseWorkspaceReference.reference_id,
            CaseWorkspaceReference.title,
            CaseWorkspaceReference.created_at,
            CaseWorkspaceReference.created_by,
            CaseWorkspaceReference.details["workspace_metadata"]["owner"]
            .as_string()
            .label("owner"),
            CaseWorkspaceReference.details["workspace_metadata"]["updated_at"]
            .as_string()
            .label("owner_updated_at"),
            CaseWorkspaceReference.details["metadata_only"]
            .as_boolean()
            .label("metadata_only"),
            CaseWorkspaceReference.details["request"]["system_name"]
            .as_string()
            .label("system_name"),
            CaseWorkspaceReference.details["result"]["workflow_status"]
            .as_string()
            .label("status"),
            CaseWorkspaceReference.details["result"]["version"]
            .as_string()
            .label("version"),
            CaseWorkspaceReference.details["result"]["meta"]["started_at"]
            .as_string()
            .label("initiated_at"),
        )
        .filter(CaseWorkspaceReference.reference_type.in_(REFERENCE_CATEGORIES))
        .all()
    )
    ref_map = {(row.reference_type, row.reference_id): row for row in refs}

    def base(
        identifier, category, case, *, created_at, project_name=None, reference=None
    ):
        return {
            "id": identifier,
            "category": category,
            "category_label": CATEGORIES[category],
            "project_name": _text(project_name) or (case.title if case else None),
            "case_db_id": case.id if case else None,
            "case_id": case.case_id if case else None,
            "case_owner": _text(case.assigned_to) if case else None,
            "case_created_at": _iso(case.created_at) if case else None,
            "owner": _text(reference.owner) if reference else None,
            "created_by": (
                _text(reference.created_by)
                if reference and not reference.metadata_only
                else None
            ),
            "initiated_at": None,
            "created_at": _iso(created_at),
            "version": None,
        }

    items = []
    for row in (
        db.query(
            DPIAAssessmentRecord.id,
            DPIAAssessmentRecord.case_db_id,
            DPIAAssessmentRecord.project_name,
            DPIAAssessmentRecord.version,
            DPIAAssessmentRecord.status,
            DPIAAssessmentRecord.created_at,
            DPIAAssessmentRecord.request_payload["owner"].as_string().label("owner"),
            DPIAAssessmentRecord.request_payload["department"]
            .as_string()
            .label("department"),
            DPIAAssessmentRecord.result_payload["parent_assessment_id"]
            .as_string()
            .label("parent_id"),
            DPIAAssessmentRecord.result_payload["ai_generation"]["started_at"]
            .as_string()
            .label("initiated_at"),
            DPIAAssessmentRecord.result_payload["ai_generation"]["model"]
            .as_string()
            .label("model"),
        )
        .filter(visible_title(DPIAAssessmentRecord.project_name))
        .all()
    ):
        case = cases.get(row.case_db_id)
        if case and not case.visible:
            continue
        item = base(
            row.id,
            "dpia",
            case,
            created_at=row.created_at,
            project_name=row.project_name,
            reference=ref_map.get(("dpia_assessment", row.id)),
        )
        ref = ref_map.get(("dpia_assessment", row.id))
        owner = (
            item["owner"]
            if ref and (ref.owner is not None or ref.owner_updated_at)
            else _text(row.owner)
        )
        item.update(
            version=row.version,
            parent_assessment_id=_text(row.parent_id),
            owner=owner,
            department=_text(row.department),
            initiated_at=_iso(row.initiated_at),
            status=row.status,
            model=_text(row.model),
            href=f"/vurdering?assessment_id={quote(row.id)}"
            + (f"&case={quote(case.id)}" if case else ""),
        )
        items.append(item)

    linked_audit = {
        row.reference_id: cases.get(row.case_db_id)
        for row in refs
        if row.reference_type == "legal_screening"
    }
    for row in db.query(
        V3AssessmentLog.id,
        V3AssessmentLog.case_id,
        V3AssessmentLog.created_at,
        V3AssessmentLog.aggregate_status,
        V3AssessmentLog.rule_engine_version,
        V3AssessmentLog.rules_loaded,
        V3AssessmentLog.request_payload["system_name"].as_string().label("system_name"),
        V3AssessmentLog.request_payload["project_name"]
        .as_string()
        .label("project_name"),
    ).all():
        case = (
            linked_audit.get(row.id)
            or external_cases.get(row.case_id)
            or cases.get(row.case_id)
        )
        if case and not case.visible:
            continue
        item = base(
            row.id,
            "legal_screening",
            case,
            created_at=row.created_at,
            project_name=row.system_name or row.project_name,
            reference=ref_map.get(("legal_screening", row.id)),
        )
        item.update(
            case_id=case.case_id if case else _text(row.case_id),
            status=row.aggregate_status,
            rule_engine_version=row.rule_engine_version,
            rules_loaded=row.rules_loaded,
            href=f"/historik/{quote(row.id)}",
        )
        items.append(item)

    for row in refs:
        category = REFERENCE_CATEGORIES[row.reference_type]
        if category not in {"ai_act", "fria"}:
            continue
        case = cases.get(row.case_db_id)
        if case and not case.visible:
            continue
        item = base(
            row.reference_id,
            category,
            case,
            created_at=row.created_at,
            project_name=row.system_name,
            reference=row,
        )
        item.update(
            status=_text(row.status),
            version=row.version if isinstance(row.version, (str, int, float)) else None,
            initiated_at=_iso(row.initiated_at),
            href=f"/sager/{quote(row.case_db_id)}?tab=assessments",
            snapshot_label=f"Snapshot {row.reference_id[:8]}",
        )
        items.append(item)
    for item in items:
        item["status_label"] = STATUS_LABELS.get(
            item.get("status"), _text(item.get("status"))
        )
    return items


def build_assessment_history(
    db: Session, *, limit=8, offset=0, category=None, status=None, search=None
):
    if not 1 <= limit <= 50 or offset < 0 or (category and category not in CATEGORIES):
        raise ValueError("invalid history pagination or category")
    groups = group_history(history_metadata(db))
    # Filter after grouping: an older GO snapshot must not hide a current blocker.
    if category:
        groups = [group for group in groups if group["category"] == category]
    if status:
        groups = [group for group in groups if group["latest"].get("status") == status]
    if search:
        term = search.strip().casefold()
        groups = [
            group
            for group in groups
            if any(
                term in str(item.get(key) or "").casefold()
                for item in [group["latest"], *group["older_versions"]]
                for key in ("project_name", "case_id", "owner", "case_owner")
            )
        ]
    return {
        "count": len(groups),
        "version_count": sum(group["version_count"] for group in groups),
        "limit": limit,
        "offset": offset,
        "items": groups[offset : offset + limit],
    }
