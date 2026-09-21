"""Versioned DPIA template profiles and EDPB alignment reporting.

S.H.I.E.L.D.'s current Excel export remains based on Datatilsynet's Danish
workbook.  The EDPB 2026 v1 template is a consultation version, so it is
represented as a non-canonical alignment profile.  Historical assessments
retain both their export-template version and the exact alignment profile used
at assessment time.  A future final EDPB profile can therefore be added without
silently reinterpreting old decisions.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


EDPB_DRAFT_PROFILE_ID = "edpb-dpia-2026-v1-consultation"
EDPB_DRAFT_SOURCE = (
    "https://www.edpb.europa.eu/public-consultations/"
    "template-for-data-protection-impact-assessment_en"
)
EDPB_DRAFT_DOCUMENT = (
    "https://www.edpb.europa.eu/system/files/2026-05/"
    "edpb_dpia_template_2026_v1_en.docx"
)
EDPB_DRAFT_SHA256 = "dd63eb8ef24db25639961a50e320e6c5fe674114d1478efce8f84be0ea269720"


class TemplateProfile(BaseModel):
    id: str
    title: str
    version: str
    authority: str
    status: Literal["canonical_export", "consultation_preview", "retired"]
    adopted_at: date | None = None
    consultation_closed_at: date | None = None
    source_url: str
    document_url: str | None = None
    sha256: str | None = None
    note: str


class AlignmentArea(BaseModel):
    id: str
    title: str
    state: Literal["covered", "partial", "missing"]
    explanation: str
    missing_fields: list[str] = Field(default_factory=list)


class TemplateAlignment(BaseModel):
    profile_id: str = EDPB_DRAFT_PROFILE_ID
    profile_status: Literal["consultation_preview"] = "consultation_preview"
    score: int = Field(ge=0, le=100)
    covered: int = Field(ge=0)
    partial: int = Field(ge=0)
    missing: int = Field(ge=0)
    areas: list[AlignmentArea]
    disclaimer: str = (
        "EDPB-profilen er et konsultationsudkast og erstatter ikke den danske "
        "skabelon eller en juridisk godkendelse."
    )


def list_template_profiles() -> list[TemplateProfile]:
    from src.services.dpia_assessment import TEMPLATE_VERSION

    return [
        TemplateProfile(
            id=TEMPLATE_VERSION,
            title="Datatilsynets danske konsekvensanalyseskabelon for AI",
            version="2024-05-22",
            authority="Datatilsynet",
            status="canonical_export",
            source_url="https://www.datatilsynet.dk/Media/638519447926128212/Skabelon%20til%20konsekvensanalyse%20vedr%c3%b8rende%20AI.xlsx",
            sha256=TEMPLATE_VERSION.rsplit("-", 1)[-1],
            note="Aktiv, kanonisk Excel-eksport i denne S.H.I.E.L.D.-installation.",
        ),
        TemplateProfile(
            id=EDPB_DRAFT_PROFILE_ID,
            title="EDPB Template for Data Protection Impact Assessment",
            version="1.0",
            authority="European Data Protection Board",
            status="consultation_preview",
            adopted_at=date(2026, 3, 10),
            consultation_closed_at=date(2026, 6, 9),
            source_url=EDPB_DRAFT_SOURCE,
            document_url=EDPB_DRAFT_DOCUMENT,
            sha256=EDPB_DRAFT_SHA256,
            note=(
                "Konsultationen er afsluttet, men EDPB oplyser, at skabelonen "
                "først derefter færdiggøres. Profilen bruges kun til gap-analyse."
            ),
        ),
    ]


def _value(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _text_present(obj: Any, name: str, minimum: int = 10) -> bool:
    return len(str(_value(obj, name, "") or "").strip()) >= minimum


def assess_edpb_alignment(request: Any, result: Any | None = None) -> TemplateAlignment:
    """Map a S.H.I.E.L.D. questionnaire snapshot to EDPB v1's seven chapters.

    This is a completeness mapping, not a legal conclusion.  It deliberately
    marks areas partial where S.H.I.E.L.D. has related information but lacks one of
    the EDPB template's requested records.
    """

    risks = list(_value(result, "risks", []) or [])
    controls = list(_value(request, "controls", []) or [])
    legal_basis = _value(request, "legal_basis", "not_assessed")
    areas = [
        AlignmentArea(
            id="overview",
            title="Overblik over behandlingen",
            state="covered" if all(_text_present(request, key, 2) for key in ("project_name", "organisation", "owner")) else "partial",
            explanation="Navn, organisation, ansvarlig og versionsoplysninger danner processens tekniske stamblad.",
            missing_fields=[] if _text_present(request, "processing_version", 1) else ["Behandlingens versionshistorik"],
        ),
        AlignmentArea(
            id="systematic_description",
            title="Systematisk beskrivelse",
            state="covered",
            explanation="Formål, behandlingsbeskrivelse, registrerede, datakategorier, leverandør og hosting er struktureret.",
        ),
        AlignmentArea(
            id="lawfulness_and_principles",
            title="Lovlighed og databeskyttelsesprincipper",
            state="covered" if legal_basis != "not_assessed" and bool(controls) else "partial",
            explanation="Retsgrundlag, særlige datakategorier, opbevaring, rettigheder og kontrolforanstaltninger vurderes.",
            missing_fields=[] if legal_basis != "not_assessed" else ["Afklaret retsgrundlag"],
        ),
        AlignmentArea(
            id="necessity_proportionality",
            title="Nødvendighed og proportionalitet",
            state=(
                "covered"
                if _text_present(request, "alternatives_considered", 20)
                and _text_present(request, "benefits_and_proportionality", 20)
                else "partial"
            ),
            explanation="EDPB beder både om mindre indgribende alternativer og en dokumenteret interesseafvejning.",
            missing_fields=[
                label
                for field, label in (
                    ("alternatives_considered", "Undersøgte mindre indgribende alternativer"),
                    ("benefits_and_proportionality", "Dokumenteret proportionalitetsafvejning"),
                )
                if not _text_present(request, field, 20)
            ],
        ),
        AlignmentArea(
            id="risk_and_action_plan",
            title="Risikovurdering og handlingsplan",
            state="covered" if risks and all(_value(item, "owner", "") for item in risks) else "partial",
            explanation="Inherent og residual risiko samt foranstaltning og ejer dokumenteres pr. scenarie.",
            missing_fields=[] if risks else ["Dokumenterede risikoscenarier og rest-risiko"],
        ),
        AlignmentArea(
            id="interested_parties",
            title="Inddragelse af DPO og registrerede",
            state=(
                "covered"
                if _text_present(request, "dpo_advice", 20)
                and _text_present(request, "data_subject_consultation", 20)
                else "partial"
            ),
            explanation="EDPB efterspørger både DPO-rådgivning og registreredes synspunkter eller en begrundelse for fravalg.",
            missing_fields=[
                label
                for field, label in (
                    ("dpo_advice", "DPO-rådgivning og opfølgning"),
                    ("data_subject_consultation", "Registreredes synspunkter eller begrundet fravalg"),
                )
                if not _text_present(request, field, 20)
            ],
        ),
        AlignmentArea(
            id="conclusion_decision",
            title="Konklusion og beslutning",
            state="partial",
            explanation="S.H.I.E.L.D. foreslår status, men den formelle beslutning træffes og signeres i sagens godkenderflow.",
            missing_fields=["Verificeret godkenderbeslutning på den låste vurderingsversion"],
        ),
    ]
    covered = sum(item.state == "covered" for item in areas)
    partial = sum(item.state == "partial" for item in areas)
    missing = sum(item.state == "missing" for item in areas)
    score = round(((covered + (partial * 0.5)) / len(areas)) * 100)
    return TemplateAlignment(
        score=score,
        covered=covered,
        partial=partial,
        missing=missing,
        areas=areas,
    )
