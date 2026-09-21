"""Read-only export of the exact reviewed procurement snapshot."""

import re
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from src.api.procurement import Actor, Database
from src.database.cases import Case
from src.database.procurement import (
    ProcurementAnalysis,
    ProcurementFactReview,
    ProcurementProfile,
)
from src.services.procurement_analysis import (
    digest,
    evidence_for_case,
    source_fingerprint,
)
from src.services.procurement_export import build_procurement_review_docx


router = APIRouter(tags=["procurement-exports"])


@router.get("/api/v3/cases/{case_id}/procurement/reviews/{review_id}/export.docx")
def export_review(case_id: str, review_id: str, db: Database, actor: Actor):
    case = db.get(Case, case_id)
    review = db.get(ProcurementFactReview, review_id)
    if not case or not review or review.case_id != case_id:
        raise HTTPException(404, "Gennemgangen findes ikke på sagen.")
    analysis = db.get(ProcurementAnalysis, review.analysis_id)
    if not analysis or analysis.case_id != case_id:
        raise HTTPException(404, "Analysen findes ikke på sagen.")
    profile = db.get(ProcurementProfile, case_id)
    try:
        outdated = (
            not profile
            or digest(profile.to_dict()) != analysis.profile_fingerprint
            or source_fingerprint(evidence_for_case(db, case_id))
            != analysis.source_fingerprint
        )
    except (ValueError, OSError):
        outdated = True
    content = build_procurement_review_docx(
        analysis.to_dict(),
        review.to_dict(),
        outdated=outdated,
        case_reference=case.case_id,
    )
    system_name = analysis.generation_payload["profile_snapshot"]["system_name"]
    safe_name = (
        re.sub(r"[^\w -]", "", system_name, flags=re.UNICODE).strip()[:80]
        or "AI-vurdering"
    )
    filename = f"Juridisk gennemgang - {safe_name} - {review.id[:8]}.docx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=\"juridisk-gennemgang-{review.id[:8]}.docx\"; filename*=UTF-8''{quote(filename, safe='')}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
