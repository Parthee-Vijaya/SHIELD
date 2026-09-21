"""Extract evidence-bound facts; never approve a procurement or legal basis."""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from typing import Annotated, Any, Literal
from uuid import NAMESPACE_URL, uuid4, uuid5

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    model_validator,
)
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.database.cases import Case
from src.database.procurement import ProcurementAnalysis, ProcurementProfile
from src.services.dpia_ai import _Review
from src.services.dpia_assessment import DPIAAssessmentRequest


REPO_ROOT = Path(__file__).resolve().parents[2]
PROMPT_VERSION = "municipal-ai-solution-evidence-2026-09-20-v2"
# Serialized evidence includes excerpt IDs, provenance and profile metadata.
MAX_SOURCE_PACK_CHARS = 300_000
ALLOWED_CODEX_MODELS = {"gpt-5.6-sol", "gpt-6-astra"}
ALLOWED_FIELDS = {
    "purpose",
    "processing_description",
    "supplier_name",
    "solution_type",
    "hosting_region",
    "transfer_outside_eea",
    "model_training",
    "retention_period",
    "data_subjects",
    "personal_data_categories",
    "special_categories",
    "criminal_data",
    "cpr_data",
    "vulnerable_subjects",
    "large_scale",
    "systematic_monitoring",
    "automated_decisions",
    "human_oversight",
    "controls",
    "secondary_uses",
}


class MaterialAnalysisError(ValueError):
    pass


class MaterialChangedError(MaterialAnalysisError):
    pass


class MaterialUnavailableError(MaterialAnalysisError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SourceReference(StrictModel):
    source_id: str = Field(min_length=1, max_length=200)
    quote: str = Field(min_length=12, max_length=4000)


class MaterialFact(StrictModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    field: str
    value: Any
    label: str | None = Field(default=None, max_length=500)
    source_refs: list[SourceReference] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def validate_safe_value(self):
        if self.field not in ALLOWED_FIELDS:
            raise ValueError("Feltet må ikke udfyldes af AI.")
        field = DPIAAssessmentRequest.model_fields[self.field]
        annotation = (
            Annotated[field.annotation, *field.metadata]
            if field.metadata
            else field.annotation
        )
        adapter = TypeAdapter(annotation)
        self.value = adapter.validate_python(self.value, strict=True)
        if isinstance(self.value, list) and len(self.value) != len(set(self.value)):
            raise ValueError("Gentagne værdier er ikke tilladt.")
        return self


class MaterialQuestion(StrictModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    question: str = Field(min_length=10, max_length=2000)
    topic: str = Field(min_length=1, max_length=200)
    priority: Literal["high", "normal"]


class MaterialConflict(StrictModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    description: str = Field(min_length=10, max_length=4000)
    source_refs: list[SourceReference] = Field(min_length=2, max_length=12)


class MaterialDraft(StrictModel):
    summary: str = Field(min_length=20, max_length=8000)
    facts: list[MaterialFact] = Field(max_length=20)
    questions: list[MaterialQuestion] = Field(min_length=1, max_length=50)
    conflicts: list[MaterialConflict] = Field(max_length=20)


def digest(value: Any) -> str:
    return sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def evidence_for_case(db: Session, case_id: str) -> list[dict]:
    from src.services.source_material import case_source_evidence

    return sorted(case_source_evidence(db, case_id), key=lambda source: source["id"])


def source_fingerprint(sources: list[dict]) -> str:
    return digest(
        [
            {
                key: source.get(key)
                for key in (
                    "id",
                    "title",
                    "text",
                    "version",
                    "checksum",
                    "locator",
                    "document_version_id",
                    "source_url",
                )
            }
            for source in sorted(sources, key=lambda source: source["id"])
        ]
    )


def prepare_source_pack(db: Session, case_id: str) -> dict:
    profile = db.get(ProcurementProfile, case_id)
    if not profile or not db.get(Case, case_id):
        raise MaterialAnalysisError("Sagen har ingen profil for den løsning, der skal vurderes.")
    sources = evidence_for_case(db, case_id)
    if not sources:
        raise MaterialAnalysisError(
            "Tilføj mindst ét dokument eller en hjemmeside med læsbart indhold om løsningen og den AI-funktion, der skal vurderes."
        )
    if len({source["id"] for source in sources}) != len(sources):
        raise MaterialAnalysisError("Kilderne har gentagne identifikatorer.")
    pack = {
        "case_id": case_id,
        "profile": profile.to_dict(),
        "sources": sources,
        "profile_fingerprint": digest(profile.to_dict()),
        "source_fingerprint": source_fingerprint(sources),
        "prompt_version": PROMPT_VERSION,
    }
    if len(json.dumps(pack, ensure_ascii=False)) > MAX_SOURCE_PACK_CHARS:
        raise MaterialAnalysisError(
            "Kildematerialet er for omfattende til én analyse. Afgræns de dokumenter, der indgår i sagen."
        )
    pack["source_pack_sha256"] = digest(pack)
    return pack


def check_pack(db: Session, pack: dict) -> None:
    if digest(
        {key: value for key, value in pack.items() if key != "source_pack_sha256"}
    ) != pack.get("source_pack_sha256"):
        raise MaterialChangedError("Kildepakken er ændret efter klargøringen.")
    if digest(pack.get("profile")) != pack.get(
        "profile_fingerprint"
    ) or source_fingerprint(pack.get("sources", [])) != pack.get("source_fingerprint"):
        raise MaterialChangedError(
            "Kildepakken svarer ikke til det dokumenterede grundlag."
        )
    current = prepare_source_pack(db, pack["case_id"])
    if any(
        current[key] != pack.get(key)
        for key in ("profile_fingerprint", "source_fingerprint", "prompt_version")
    ):
        raise MaterialChangedError(
            "Sagens oplysninger eller kilder er ændret. Start analysen igen på det aktuelle grundlag."
        )


def validate_draft(pack: dict, raw: dict) -> dict:
    try:
        draft = MaterialDraft.model_validate(raw)
    except ValidationError as exc:
        raise MaterialAnalysisError(
            "AI-udkastet indeholder ugyldige felter eller værdier."
        ) from exc
    sources = {source["id"]: source for source in pack["sources"]}
    ids = [item.id for item in [*draft.facts, *draft.questions, *draft.conflicts]]
    if len(ids) != len(set(ids)) or len({fact.field for fact in draft.facts}) != len(
        draft.facts
    ):
        raise MaterialAnalysisError(
            "AI-udkastet indeholder gentagne felter eller identifikatorer."
        )

    def normalize(value):
        return " ".join(value.split())
    for item in [*draft.facts, *draft.conflicts]:
        refs = [(ref.source_id, normalize(ref.quote)) for ref in item.source_refs]
        if len(refs) != len(set(refs)):
            raise MaterialAnalysisError("En kildehenvisning må ikke gentages.")
        for source_id, quote in refs:
            if source_id not in sources or quote not in normalize(
                sources[source_id]["text"]
            ):
                raise MaterialAnalysisError(
                    "Et citat findes ikke i den angivne kilde. Analysen blev ikke gemt."
                )
    if not draft.facts and not any(
        question.priority == "high" for question in draft.questions
    ):
        raise MaterialAnalysisError(
            "Manglende dokumenterede oplysninger skal fremgå som spørgsmål med høj prioritet."
        )
    result = draft.model_dump(mode="json")
    for fact in result["facts"]:
        # A null value records uncertainty; only the optional label may be omitted.
        if fact["label"] is None:
            del fact["label"]
    return result


def run_worker(payload: dict) -> dict:
    try:
        completed = subprocess.run(
            [
                "node",
                "--env-file-if-exists=.env.local",
                "ai-gateway/analyze-material.mts",
            ],
            cwd=REPO_ROOT,
            input=json.dumps(payload, ensure_ascii=False, allow_nan=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MaterialUnavailableError(
            "AI-analysen kunne ikke gennemføres nu. Prøv igen senere."
        ) from exc
    if len(completed.stdout.encode()) > 2_000_000:
        raise MaterialUnavailableError("AI-analysen returnerede for meget indhold.")
    try:
        output = json.loads(completed.stdout)
    except (ValueError, TypeError) as exc:
        raise MaterialUnavailableError(
            "AI-analysen returnerede et ugyldigt svar."
        ) from exc
    if completed.returncode or not isinstance(output, dict) or output.get("error"):
        code = (
            output.get("error", {}).get("code")
            if isinstance(output, dict) and isinstance(output.get("error"), dict)
            else None
        )
        message = (
            "AI Gateway kræver betalte kreditter til den valgte model. Ingen analyse er gemt."
            if code == "paid_credits_required"
            else "AI- eller JEV-kontrollen kunne ikke gennemføres. Ingen analyse er gemt."
        )
        raise MaterialUnavailableError(message)
    return output


def validate_review(draft: dict, raw: dict) -> dict:
    try:
        review = _Review.model_validate(raw)
    except ValidationError as exc:
        raise MaterialAnalysisError(
            "JEV-kontrollen returnerede et ugyldigt svar."
        ) from exc
    expected = {
        "summary",
        *[f"fact:{item['id']}" for item in draft["facts"]],
        *[f"conflict:{item['id']}" for item in draft["conflicts"]],
    }
    ids = [check.id for check in review.checks]
    if (
        review.model != "typesafe-ai/jev"
        or set(ids) != expected
        or len(ids) != len(expected)
        or review.threshold != 0.5
        or any(
            check.requires_review != (check.probability >= 0.5)
            for check in review.checks
        )
        or review.status
        != (
            "findings_require_review"
            if any(check.requires_review for check in review.checks)
            else "requires_human_review"
        )
    ):
        raise MaterialAnalysisError("JEV-kontrollen dækker ikke alle påstande korrekt.")
    return review.model_dump(mode="json")


def latest_analysis(db: Session, case_id: str) -> dict | None:
    record = (
        db.query(ProcurementAnalysis)
        .filter_by(case_id=case_id)
        .order_by(ProcurementAnalysis.created_at.desc(), ProcurementAnalysis.id.desc())
        .first()
    )
    if not record:
        return None
    profile = db.get(ProcurementProfile, case_id)
    payload = record.to_dict()
    try:
        payload["outdated"] = (
            not profile
            or digest(profile.to_dict()) != record.profile_fingerprint
            or source_fingerprint(evidence_for_case(db, case_id))
            != record.source_fingerprint
        )
    except (ValueError, OSError):
        payload["outdated"] = True
    return payload


def save_analysis(
    db: Session,
    pack: dict,
    draft: dict,
    review: dict,
    *,
    model: str,
    provider: str,
    run_id: str | None = None,
) -> dict:
    draft = validate_draft(pack, draft)
    review = validate_review(draft, review)
    analysis_id = (
        str(uuid5(NAMESPACE_URL, f"judge-dredd:procurement:{run_id}"))
        if run_id
        else str(uuid4())
    )
    generation = {
        **draft,
        "review": review,
        "sources": pack["sources"],
        "profile_snapshot": pack["profile"],
        "prompt_version": PROMPT_VERSION,
        "source_pack_sha256": pack["source_pack_sha256"],
        "draft_sha256": digest(draft),
        "run_id": run_id,
        "provenance_note": (
            "Model og kørsels-ID er angivet af den lokale Codex-operatør; importen starter ikke Codex."
            if provider == "codex-local-test"
            else "Udarbejdet via AI Gateway og kontrolleret af JEV."
        ),
        "limitations": [
            "Udkast til faglig og juridisk gennemgang; JEV er kildekontrol og ikke juridisk godkendelse.",
            "Leverandørmateriale dokumenterer leverandørens udsagn og bekræfter ikke den faktiske drift eller kommunens konkrete anvendelse.",
        ],
    }
    try:
        db.rollback()
        if db.get_bind().dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        else:
            db.query(Case).filter_by(id=pack["case_id"]).with_for_update().one()
        db.expire_all()
        check_pack(db, pack)
        existing = db.get(ProcurementAnalysis, analysis_id)
        if existing:
            if (
                existing.case_id != pack["case_id"]
                or existing.model != model
                or existing.generation_provider != provider
                or any(
                    existing.generation_payload.get(key) != generation.get(key)
                    for key in ("draft_sha256", "source_pack_sha256", "run_id")
                )
            ):
                raise MaterialAnalysisError(
                    "Kørsels-ID'et er allerede anvendt til en anden analyse."
                )
            result = {**existing.to_dict(), "outdated": False, "already_saved": True}
            db.rollback()
            return result
        record = ProcurementAnalysis(
            id=analysis_id,
            case_id=pack["case_id"],
            created_at=datetime.now(UTC),
            profile_fingerprint=pack["profile_fingerprint"],
            source_fingerprint=pack["source_fingerprint"],
            generation_payload=generation,
            model=model,
            generation_provider=provider,
            status="requires_human_review",
        )
        db.add(record)
        db.flush()
        result = {**record.to_dict(), "outdated": False}
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


def analyze_case(db: Session, case_id: str, worker=run_worker) -> dict:
    pack = prepare_source_pack(db, case_id)
    db.rollback()  # Never hold a database transaction during a model request.
    output = worker({"profile": pack["profile"], "sources": pack["sources"]})
    if (
        output.get("model") != "openai/gpt-5.5"
        or output.get("prompt_version") != PROMPT_VERSION
    ):
        raise MaterialAnalysisError(
            "AI-analysen har en ukendt model eller skabelonversion."
        )
    return save_analysis(
        db,
        pack,
        output.get("draft", {}),
        output.get("review", {}),
        model=output["model"],
        provider="vercel-ai-gateway",
    )


def import_codex_analysis(
    db: Session,
    pack: dict,
    raw_draft: dict,
    *,
    model: str,
    run_id: str,
    worker=run_worker,
) -> dict:
    if model not in ALLOWED_CODEX_MODELS or not re.fullmatch(
        r"[A-Za-z0-9_./:-]{1,200}", run_id
    ):
        raise MaterialAnalysisError(
            "Angiv den faktiske Codex-model og et entydigt kørsels-ID."
        )
    check_pack(db, pack)
    draft = validate_draft(pack, raw_draft)
    previous = db.get(
        ProcurementAnalysis,
        str(uuid5(NAMESPACE_URL, f"judge-dredd:procurement:{run_id}")),
    )
    if previous:
        if (
            previous.case_id != pack["case_id"]
            or previous.model != model
            or previous.generation_provider != "codex-local-test"
            or previous.generation_payload.get("draft_sha256") != digest(draft)
            or previous.generation_payload.get("source_pack_sha256")
            != pack["source_pack_sha256"]
        ):
            raise MaterialAnalysisError(
                "Kørsels-ID'et er allerede anvendt til en anden analyse."
            )
        result = {**previous.to_dict(), "outdated": False, "already_saved": True}
        db.rollback()
        return result
    db.rollback()
    output = worker(
        {
            "mode": "evaluate",
            "profile": pack["profile"],
            "sources": pack["sources"],
            "draft": draft,
        }
    )
    return save_analysis(
        db,
        pack,
        draft,
        output.get("review", {}),
        model=model,
        provider="codex-local-test",
        run_id=run_id,
    )
