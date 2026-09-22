"""Authenticated global search over display metadata, never source documents.

The API boundary grants the same workspace roles as case/document endpoints.
No result body, request JSON, filesystem path or raw document text is selected.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any
from urllib.parse import quote

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from src.database.cases import Case, CASE_STATUS_LABELS
from src.database.case_visibility import visible_title
from src.database.case_workspace import CaseWorkspaceReference
from src.database.document_bank import MunicipalDocument, CaseDocumentLink
from src.database.dpia import DPIAAssessmentRecord


CATEGORIES = ("cases", "assessments", "documents", "guidance")
REFERENCE_LABELS = {
    "legal_screening": "Juridisk screening",
    "ai_act_assessment": "AI Act-vurdering",
    "fria_assessment": "Grundrettighedsvurdering",
}
DOCUMENT_LABELS = {
    "data_processing_agreement": "Databehandleraftale",
    "security_documentation": "Sikkerhedsdokumentation",
    "supplier_documentation": "Leverandørmateriale",
    "policy": "Politik",
    "assessment": "Vurdering",
    "template": "Skabelon",
    "other": "Dokument",
}


def normalize_search(value: Any) -> str:
    value = (
        str(value or "").lower().replace("æ", "ae").replace("ø", "o").replace("å", "aa")
    )
    return re.sub(
        r"[^a-z0-9]+",
        " ",
        "".join(
            char
            for char in unicodedata.normalize("NFKD", value)
            if not unicodedata.combining(char)
        ),
    ).strip()


def edit_distance(left: str, right: str) -> int:
    """Optimal string alignment: also tolerate swapped adjacent letters."""
    rows = [list(range(len(right) + 1))]
    for i, char in enumerate(left, 1):
        row = [i]
        for j, other in enumerate(right, 1):
            distance = min(
                row[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + (char != other)
            )
            if i > 1 and j > 1 and char == right[j - 2] and left[i - 2] == other:
                distance = min(distance, rows[i - 2][j - 2] + 1)
            row.append(distance)
        rows.append(row)
    return rows[-1][-1]


def fuzzy_score(query: str, value: str) -> float:
    needle, haystack = normalize_search(query), normalize_search(value)
    if not needle or not haystack:
        return 0
    if needle == haystack:
        return 120
    if needle in haystack:
        return 100 if haystack.startswith(needle) else 90
    words = haystack.split()
    scores = []
    for token in needle.split():
        best = 0
        allowance = 2 if len(token) >= 7 else 1 if len(token) >= 4 else 0
        for word in words:
            if token == word:
                best = max(best, 85)
            elif word.startswith(token):
                best = max(best, 78)
            elif token in word:
                best = max(best, 70)
            elif allowance and abs(len(token) - len(word)) <= allowance:
                distance = edit_distance(token, word)
                if distance <= allowance:
                    best = max(best, 60 - distance * 10)
        if not best:
            return 0
        scores.append(best)
    return sum(scores) / len(scores)


def build_workspace_search(
    db: Session,
    query: str,
    *,
    limit: int = 5,
    knowledge: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Search complete metadata sets; keep historical versions out of top hits."""
    groups: dict[str, list[dict[str, Any]]] = {key: [] for key in CATEGORIES}

    def add(
        category: str,
        identifier: str,
        title: str,
        summary: str,
        route: str,
        *,
        keywords: str = "",
        updated_at: datetime | None = None,
    ) -> None:
        title_score = fuzzy_score(query, title)
        score = max(
            title_score + 10 if title_score else 0,
            fuzzy_score(query, f"{title} {summary} {keywords}"),
        )
        if not score:
            return
        groups[category].append(
            {
                "id": identifier,
                "type": category,
                "title": title,
                "summary": summary,
                "action": {"route": route},
                "score": score,
                "updated_at": updated_at.isoformat() if updated_at else None,
            }
        )

    cases = (
        db.query(
            Case.id,
            Case.case_id,
            Case.title,
            Case.status,
            Case.assigned_to,
            Case.updated_at,
        )
        .filter(visible_title(Case.title))
        .all()
    )
    case_map = {item.id: item for item in cases}
    for case_row in cases:
        summary = " · ".join(
            filter(
                None,
                [
                    case_row.case_id,
                    CASE_STATUS_LABELS.get(case_row.status, case_row.status),
                    case_row.assigned_to,
                ],
            )
        )
        add(
            "cases",
            f"case-{case_row.id}",
            case_row.title,
            summary,
            f"/sager/{quote(case_row.id)}",
            updated_at=case_row.updated_at,
        )

    # Metadata-only projection is deliberate: do not load the two JSON payloads.
    latest = (
        db.query(
            DPIAAssessmentRecord.case_db_id.label("case_id"),
            func.max(DPIAAssessmentRecord.version).label("version"),
        )
        .group_by(DPIAAssessmentRecord.case_db_id)
        .subquery()
    )
    assessments = (
        db.query(
            DPIAAssessmentRecord.id,
            DPIAAssessmentRecord.case_db_id,
            DPIAAssessmentRecord.project_name,
            DPIAAssessmentRecord.organisation,
            DPIAAssessmentRecord.version,
            DPIAAssessmentRecord.created_at,
        )
        .outerjoin(latest, DPIAAssessmentRecord.case_db_id == latest.c.case_id)
        .filter(
            visible_title(DPIAAssessmentRecord.project_name.expression),
            or_(
                DPIAAssessmentRecord.case_db_id.is_(None),
                DPIAAssessmentRecord.version == latest.c.version,
            ),
        )
        .all()
    )
    for assessment in assessments:
        if assessment.case_db_id and assessment.case_db_id not in case_map:
            continue
        title = f"Konsekvensanalyse og risici · {assessment.project_name}"
        summary = f"Version {assessment.version} · {assessment.organisation}"
        route = f"/vurdering?assessment_id={quote(assessment.id)}"
        if assessment.case_db_id:
            route += f"&case={quote(assessment.case_db_id)}"
        add(
            "assessments",
            f"dpia-{assessment.id}",
            title,
            summary,
            route,
            keywords="DPIA risikovurdering",
            updated_at=assessment.created_at,
        )

    references = (
        db.query(
            CaseWorkspaceReference.id,
            CaseWorkspaceReference.case_db_id,
            CaseWorkspaceReference.reference_type,
            CaseWorkspaceReference.title,
            CaseWorkspaceReference.source_version,
            CaseWorkspaceReference.created_at,
        )
        .filter(CaseWorkspaceReference.reference_type.in_(REFERENCE_LABELS))
        .order_by(CaseWorkspaceReference.created_at.desc())
        .all()
    )
    seen = set()
    for reference in references:
        case = case_map.get(reference.case_db_id)
        key = (reference.case_db_id, reference.reference_type)
        if not case or key in seen:
            continue
        seen.add(key)
        add(
            "assessments",
            f"reference-{reference.id}",
            f"{REFERENCE_LABELS[reference.reference_type]} · {case.title}",
            f"{reference.title or REFERENCE_LABELS[reference.reference_type]}"
            + (
                f" · Version {reference.source_version}"
                if reference.source_version
                else ""
            ),
            f"/sager/{quote(case.id)}?tab=assessments",
            updated_at=reference.created_at,
        )

    links: dict[str, list[str]] = {}
    for document_id, case_id in (
        db.query(CaseDocumentLink.document_id, CaseDocumentLink.case_db_id)
        .distinct()
        .all()
    ):
        links.setdefault(document_id, []).append(case_id)
    documents = (
        db.query(
            MunicipalDocument.id,
            MunicipalDocument.title,
            MunicipalDocument.category,
            MunicipalDocument.owner,
            MunicipalDocument.updated_at,
        )
        .filter(MunicipalDocument.is_active.is_(True))
        .all()
    )
    for document in documents:
        linked_ids = links.get(document.id, [])
        linked_cases = [
            case_map[case_id] for case_id in linked_ids if case_id in case_map
        ]
        if linked_ids and not linked_cases:
            continue
        summary = " · ".join(
            filter(
                None,
                [DOCUMENT_LABELS.get(document.category, "Dokument"), document.owner],
            )
        )
        if linked_cases:
            summary += " · " + linked_cases[0].title
        add(
            "documents",
            f"document-{document.id}",
            document.title,
            summary,
            f"/dokumentbank?document_id={quote(document.id)}",
            keywords=(
                "DBA DPA" if document.category == "data_processing_agreement" else ""
            ),
            updated_at=document.updated_at,
        )

    for entry in knowledge or []:
        title = entry.get("term") or ""
        # This is curated, public guidance; no document content is indexed.
        add(
            "guidance",
            f"knowledge-{entry.get('id') or title}",
            title,
            (entry.get("definition") or "")[:200],
            f"/videnbase?query={quote(title)}",
            keywords=" ".join(entry.get("tags") or []),
        )

    results = []
    sections = {}
    for category, items in groups.items():
        items.sort(
            key=lambda item: (
                item["score"],
                item.get("updated_at") or "",
                item["title"],
            ),
            reverse=True,
        )
        results.extend(items[:limit])
        sections[category] = {"count": min(len(items), limit), "total": len(items)}
    return {"query": query, "results": results, "sections": sections}
