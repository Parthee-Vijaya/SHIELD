"""Server-side GPT/Jev drafting with a deterministic assessment boundary.

The Node worker only proposes prose. Scores, mandatory findings and workflow
state come from the existing stored assessment and are never taken from it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.services.analysis_limits import (
    ANALYSIS_TIMEOUT_SECONDS,
    MAX_CASE_DOCUMENTS,
    MAX_CASE_TEXT_CHARS,
    MAX_DOCUMENT_TEXT_CHARS,
    MAX_CASE_EXCERPTS,
    BatchingMetadata,
    validate_batching_metadata,
    validate_source_budget,
    requires_batching,
)

from src.services.dpia_assessment import (
    DPIAAssessmentRequest,
    DPIAAssessmentResponse,
    DPIARecommendation,
    RISK_DEFINITIONS,
    SECTION_TITLES,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATION_TIMEOUT_SECONDS = ANALYSIS_TIMEOUT_SECONDS
MAX_WORKER_OUTPUT_BYTES = 2_000_000
MAX_DOCUMENT_SOURCE_CHARS = MAX_CASE_TEXT_CHARS
MAX_SINGLE_DOCUMENT_SOURCE_CHARS = MAX_DOCUMENT_TEXT_CHARS
MAX_DOCUMENT_SOURCE_EXCERPTS = MAX_CASE_EXCERPTS


class AIGenerationError(Exception):
    """An intentionally safe, user-facing failure; no worker stderr attached."""


class AIGenerationUnavailable(AIGenerationError):
    pass


class InvalidAIDraft(AIGenerationError):
    pass


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _SectionDraft(_StrictModel):
    id: str
    text: str = Field(min_length=1, max_length=20_000)
    source_ids: list[str] = Field(min_length=1, max_length=100)


class _RiskDraft(_StrictModel):
    id: str
    scenario: str = Field(min_length=1, max_length=12_000)
    measures: str = Field(min_length=1, max_length=12_000)
    rationale: str = Field(min_length=1, max_length=12_000)
    consequences: str = Field(default="", max_length=12_000)
    source_ids: list[str] = Field(min_length=1, max_length=100)


class _AdditionalRisk(_StrictModel):
    title: str = Field(min_length=1, max_length=500)
    scenario: str = Field(min_length=1, max_length=12_000)
    measures: str = Field(min_length=1, max_length=12_000)
    source_ids: list[str] = Field(min_length=1, max_length=100)


class _Draft(_StrictModel):
    executive_summary: str = Field(min_length=1, max_length=20_000)
    scope: str = Field(min_length=1, max_length=20_000)
    summary_source_ids: list[str] = Field(min_length=1, max_length=100)
    sections: list[_SectionDraft] = Field(min_length=39, max_length=39)
    risks: list[_RiskDraft] = Field(min_length=33, max_length=33)
    additional_risks: list[_AdditionalRisk] = Field(default_factory=list, max_length=30)
    recommendations: list[DPIARecommendation] = Field(
        default_factory=list, max_length=8
    )
    open_questions: list[str] = Field(default_factory=list, max_length=100)


class _ReviewCheck(_StrictModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=1000)
    section_ids: list[str] = Field(max_length=72)
    probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    requires_review: bool


class _Review(_StrictModel):
    model: str = Field(min_length=1, max_length=160)
    rubric_version: str = Field(min_length=1, max_length=160)
    checks: list[_ReviewCheck] = Field(min_length=1, max_length=111)
    status: Literal["findings_require_review", "requires_human_review"]
    threshold: float = Field(default=0.5, ge=0, le=1, allow_inf_nan=False)
    threshold_note: str = Field(default="", max_length=1000)
    usage: list[dict[str, Any]] = Field(default_factory=list, max_length=500)


class _WorkerOutput(_StrictModel):
    draft: _Draft
    review: _Review
    model: str = Field(min_length=1, max_length=160)
    prompt_version: str = Field(min_length=1, max_length=160)
    usage: dict[str, Any] = Field(default_factory=dict)
    batching: BatchingMetadata | None = None


def _run_worker(payload: dict[str, Any], *, timeout: int) -> dict[str, Any]:
    """Use argv/stdin only; never interpolate prompts or report stderr."""
    try:
        process = subprocess.run(
            [
                "node",
                "--env-file-if-exists=.env.local",
                "ai-gateway/generate-report.mts",
            ],
            cwd=REPO_ROOT,
            input=json.dumps(payload, ensure_ascii=False, allow_nan=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise AIGenerationUnavailable(
            "AI-udarbejdelsen overskred tidsgrænsen. Den gemte vurdering er bevaret."
        ) from None
    except (OSError, UnicodeError, ValueError):
        raise AIGenerationUnavailable(
            "AI-tjenesten kunne ikke startes. Kontrollér serverens AI-konfiguration."
        ) from None
    if process.returncode != 0:
        # Recognize only server-owned error codes; never forward worker text.
        try:
            error = (
                json.loads(process.stdout).get("error", {})
                if len(process.stdout) <= MAX_WORKER_OUTPUT_BYTES
                else {}
            )
        except (ValueError, TypeError, AttributeError):
            error = {}
        if isinstance(error, dict) and error.get("code") == "paid_credits_required":
            raise AIGenerationUnavailable(
                "GPT-5.5 kræver betalte AI Gateway-kreditter på Vercel-teamet. Ingen ny analyse er gemt."
            )
        raise AIGenerationUnavailable(
            "AI-tjenesten kunne ikke færdiggøre rapporten. Den gemte vurdering er bevaret."
        ) from None
    if len(process.stdout.encode("utf-8")) > MAX_WORKER_OUTPUT_BYTES:
        raise InvalidAIDraft("AI-tjenestens svar overskred den tilladte størrelse.")
    try:
        parsed = json.loads(process.stdout)
    except (ValueError, TypeError):
        raise InvalidAIDraft("AI-tjenesten returnerede et ugyldigt svar.") from None
    if not isinstance(parsed, dict):
        raise InvalidAIDraft("AI-tjenesten returnerede et ugyldigt svar.")
    return parsed


def gateway_status() -> dict[str, Any]:
    """Ask the same worker that loads credentials; only expose fixed fields."""
    fallback: dict[str, Any] = {
        "configured": False,
        "model": "openai/gpt-5.5",
        "evaluator_model": "typesafe-ai/jev",
    }
    try:
        status = _run_worker({"status_only": True}, timeout=15)
    except AIGenerationError:
        return fallback

    # Do not return unexpected worker fields (particularly credential material).
    def model_name(value: Any, default: str) -> str:
        import re

        return (
            value
            if isinstance(value, str)
            and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.:-]+", value)
            else default
        )

    return {
        "configured": status.get("configured") is True,
        "model": model_name(status.get("model"), fallback["model"]),
        "evaluator_model": model_name(
            status.get("evaluator_model"), fallback["evaluator_model"]
        ),
    }


def build_sources(
    request: DPIAAssessmentRequest,
    result: DPIAAssessmentResponse,
) -> list[dict[str, Any]]:
    """One traceable source per explicit field and verified stored excerpt."""
    sources: list[dict[str, Any]] = []
    for name, value in request.model_dump(mode="json").items():
        text = (
            value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        )
        sources.append(
            {
                "id": f"input:{name}",
                "title": name,
                "text": text,
                "checksum": sha256(text.encode("utf-8")).hexdigest(),
            }
        )
    if result.legal_verification:
        for receipt in result.legal_verification.receipts:
            if receipt.match_status != "verified_exact" or not receipt.matched_excerpt:
                continue
            sources.append(
                {
                    "id": f"law:{receipt.citation_id}",
                    "title": f"{receipt.law} · {receipt.provision}",
                    "text": receipt.matched_excerpt,
                    "version": receipt.checked_at.isoformat(),
                    "checksum": receipt.source_sha256
                    or sha256(receipt.matched_excerpt.encode("utf-8")).hexdigest(),
                }
            )
    return sources


def _document_source_provenance(metadata: Any) -> dict[str, str]:
    """Keep public source attribution, never arbitrary document metadata."""
    if not isinstance(metadata, dict):
        return {}
    source_url = metadata.get("source_url")
    if not isinstance(source_url, str) or not source_url or len(source_url) > 2000:
        return {}
    if any(character.isspace() or ord(character) < 32 for character in source_url):
        return {}
    try:
        parsed = urlsplit(source_url)
        if (
            parsed.scheme not in {"https", "http"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            return {}
        # Accessing port validates malformed/invalid port values as well.
        _ = parsed.port
    except ValueError:
        return {}
    provenance = {"source_url": source_url}
    retrieved_at = metadata.get("retrieved_at")
    if isinstance(retrieved_at, str) and len(retrieved_at) <= 80:
        try:
            datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
        except ValueError:
            pass
        else:
            provenance["retrieved_at"] = retrieved_at
    return provenance


def add_case_document_sources(
    db,
    case_db_id: str,
    sources: list[dict[str, Any]],
) -> list[str]:
    """Read only exact, checksum-verified versions already linked to this case.

    New source-material versions use the same excerpt IDs as procurement
    intake. Older bank links retain their document-level IDs, with locators in
    their text and offsets. Existing assessment snapshots are never modified.
    XLSX stays excluded until sheet/cell provenance is mapped. Limits and
    parser omissions are disclosed with the stored generation.
    """
    from src.database.document_bank import list_case_documents
    from src.services.document_bank_storage import read_document_bytes
    from src.services.source_material import (
        SOURCE_EXTENSIONS,
        extract_source,
        excerpt_source_id,
    )

    from src.services.source_origin import source_classification, source_warnings

    limitations = [
        "AI-udkast og Jev-kontrol er beslutningsstøtte og kræver fagligt review.",
        "Skalaer, risikoscorer, blokeringer og lovkvitteringer er bevaret fra grundvurderingen.",
    ]
    links = list_case_documents(db, case_db_id)
    # A saved report/test receipt is an output, never independent evidence.
    # Deny the version even if another link also labels it as evidence.
    output_versions = {
        link.document_version_id for link in links if link.link_role == "output"
    }
    if output_versions:
        limitations.append(
            f"{len(output_versions)} dokumentversioner er sagsoutput og indgår ikke som AI-kilder."
        )
    seen: set[str] = set()
    attempted_documents = 0
    additions: list[dict[str, Any]] = []
    known_ids = {item["id"] for item in sources}
    for link in links:
        version = link.version
        if not version or version.id in output_versions or version.id in seen:
            continue
        seen.add(version.id)
        suffix = Path(version.original_filename).suffix.lower()
        if suffix not in SOURCE_EXTENSIONS:
            limitations.append(
                f"Dokumentversion {version.id} er ikke tekstudtrukket ({suffix or 'ukendt format'})."
            )
            continue
        if version.size_bytes > 5_000_000:
            limitations.append(
                f"Dokumentversion {version.id} er udeladt: filen er større end 5 MB."
            )
            continue
        if attempted_documents >= MAX_CASE_DOCUMENTS:
            raise InvalidAIDraft(
                f"Kildegrundlaget overskrider {MAX_CASE_DOCUMENTS} dokumenter. Ingen delvis analyse er gemt."
            )
        attempted_documents += 1
        try:
            content = read_document_bytes(
                version.storage_key, expected_sha256=version.content_sha256
            )
            extraction = extract_source(content, version.original_filename)
        except Exception:
            # Parser failures are untrusted document details, never log them.
            limitations.append(
                f"Dokumentversion {version.id} kunne ikke læses sikkert og er udeladt."
            )
            continue
        category = getattr(link.document, "category", None)
        limitations.extend(
            f"Dokumentversion {version.id}: {warning}"
            for warning in source_warnings(extraction.warnings, category)
        )
        if not extraction.excerpts:
            limitations.append(
                f"Dokumentversion {version.id} indeholder ikke læsbar tekst."
            )
            continue
        if not getattr(extraction, "complete", True):
            raise InvalidAIDraft(
                f"Dokumentversion {version.id} overskrider grænsen for tekstudtræk. "
                "Opdel originalen i mindre filer. Ingen delvis analyse er gemt."
            )
        base_source = {
            "title": (
                link.document.title if link.document else version.original_filename
            ),
            "version": str(version.version_number),
            "checksum": version.content_sha256,
            "document_version_id": version.id,
            **source_classification(category),
            "review_status": "unreviewed",
            **_document_source_provenance(version.version_metadata),
        }
        metadata = version.version_metadata or {}
        use_excerpt_ids = bool(metadata.get("source_material")) or suffix == ".pptx"
        if use_excerpt_ids:
            for number, excerpt in enumerate(extraction.excerpts, 1):
                source_id = excerpt_source_id(version.id, excerpt, number)
                if source_id not in known_ids:
                    additions.append(
                        {
                            **base_source,
                            "id": source_id,
                            "title": f"{base_source['title']} · {excerpt['locator']}",
                            "text": excerpt["text"],
                            "locator": excerpt["locator"],
                        }
                    )
                    known_ids.add(source_id)
        else:
            # Preserve legacy IDs and offsets byte-for-byte for ordinary
            # documents. Oversized combined texts use stable part suffixes.
            pieces: list[str] = []
            locators: list[dict[str, Any]] = []
            consumed = 0
            for excerpt in extraction.excerpts:
                continued = ":part:" in str(excerpt.get("source_suffix", ""))
                prefix = "\n\n" if pieces and not continued else ""
                if suffix != ".txt" and not continued:
                    prefix += f"[{excerpt['locator']}]\n"
                start = consumed + len(prefix)
                pieces.append(prefix + excerpt["text"])
                consumed += len(prefix) + len(excerpt["text"])
                locators.append(
                    {"locator": excerpt["locator"], "start": start, "end": consumed}
                )
            text = "".join(pieces)
            for offset in range(0, len(text), MAX_SINGLE_DOCUMENT_SOURCE_CHARS):
                part = offset // MAX_SINGLE_DOCUMENT_SOURCE_CHARS + 1
                source_id = f"document:{version.id}" + (
                    f":part:{part}" if part > 1 else ""
                )
                if source_id in known_ids:
                    continue
                chunk = text[offset : offset + MAX_SINGLE_DOCUMENT_SOURCE_CHARS]
                chunk_locators = [
                    {
                        "locator": item["locator"],
                        "start": max(item["start"], offset) - offset,
                        "end": min(item["end"], offset + len(chunk)) - offset,
                    }
                    for item in locators
                    if item["end"] > offset and item["start"] < offset + len(chunk)
                ]
                source = {
                    **base_source,
                    "id": source_id,
                    "text": chunk,
                    "locators": chunk_locators,
                }
                if len(text) > MAX_SINGLE_DOCUMENT_SOURCE_CHARS:
                    source["locator"] = (
                        f"Dokumenttekst, tegn {offset + 1}–{offset + len(chunk)}"
                    )
                additions.append(source)
                known_ids.add(source_id)
    try:
        validate_source_budget([*sources, *additions])
    except ValueError as exc:
        raise InvalidAIDraft(str(exc)) from exc
    sources.extend(additions)
    if not any(item["id"].startswith("document:") for item in sources):
        limitations.append(
            "Ingen dokumentbankfiler indgår; udkastet bygger på formularen og eventuelle gemte lovuddrag."
        )
    return limitations


def apply_ai_draft(
    original: DPIAAssessmentResponse,
    worker_output: dict[str, Any],
    sources: list[dict[str, Any]],
    *,
    assessment_id: str,
    created_at: datetime,
    case_db_id: str,
    limitations: list[str] | None = None,
) -> DPIAAssessmentResponse:
    """Validate the full worker contract, then copy prose onto a locked base."""
    try:
        output = _WorkerOutput.model_validate(worker_output)
    except ValidationError:
        raise InvalidAIDraft(
            "AI-udkastet overholder ikke rapportens datakontrakt."
        ) from None
    try:
        batching = validate_batching_metadata(
            (
                output.batching.model_dump(mode="json", exclude_none=True)
                if output.batching
                else None
            ),
            sources,
        )
    except ValueError:
        raise InvalidAIDraft(
            "AI-kørslens batchoversigt dækker ikke hele kildegrundlaget."
        ) from None
    expected_sections = set(SECTION_TITLES)
    expected_risks = {definition.id for definition in RISK_DEFINITIONS}
    section_ids = [item.id for item in output.draft.sections]
    risk_ids = [item.id for item in output.draft.risks]
    recommendation_ids = [item.id for item in output.draft.recommendations]
    if len(recommendation_ids) != len(set(recommendation_ids)):
        raise InvalidAIDraft("AI-udkastets anbefalinger skal have entydige ID'er.")
    if (
        len(section_ids) != len(set(section_ids))
        or len(risk_ids) != len(set(risk_ids))
        or set(section_ids) != expected_sections
        or set(risk_ids) != expected_risks
        or {item.id for item in original.sections} != expected_sections
        or len(original.sections) != 39
        or {item.id for item in original.risks} != expected_risks
        or len(original.risks) != 33
    ):
        raise InvalidAIDraft(
            "AI-udkastet skal indeholde præcis skabelonens 39 afsnit og 33 risici."
        )
    known_sources = {item["id"] for item in sources}
    if not set(output.draft.summary_source_ids).issubset(known_sources):
        raise InvalidAIDraft("AI-resuméet henviser til en ukendt kilde.")
    evidence_items: list[
        _SectionDraft | _RiskDraft | _AdditionalRisk | DPIARecommendation
    ] = [
        *output.draft.sections,
        *output.draft.risks,
        *output.draft.additional_risks,
        *output.draft.recommendations,
    ]
    for item in evidence_items:
        if not set(item.source_ids).issubset(known_sources):
            raise InvalidAIDraft(
                "AI-udkastet henviser til en kilde, som ikke indgik i sagsgrundlaget."
            )
    valid_targets = (
        {"summary"}
        | {f"section:{id}" for id in expected_sections}
        | {f"risk:{id}" for id in expected_risks}
        | {
            f"additional:{index + 1}"
            for index in range(len(output.draft.additional_risks))
        }
        | {f"recommendation:{id}" for id in recommendation_ids}
    )
    check_ids = [item.id for item in output.review.checks]
    if (
        set(check_ids) != valid_targets
        or len(check_ids) != len(set(check_ids))
        or any(
            check.section_ids != [check.id]
            or check.requires_review != (check.probability >= output.review.threshold)
            for check in output.review.checks
        )
    ):
        raise InvalidAIDraft(
            "Jev-kontrollen skal dække præcis alle rapportens afsnit, risici og anbefalinger med gyldige markeringer."
        )
    expected_review_status = (
        "findings_require_review"
        if any(check.requires_review for check in output.review.checks)
        else "requires_human_review"
    )
    if output.review.status != expected_review_status:
        raise InvalidAIDraft(
            "Jev-kontrollens status stemmer ikke med kontrolpunkterne."
        )
    sections = {item.id: item for item in output.draft.sections}
    risks = {item.id: item for item in output.draft.risks}
    candidate = original.model_copy(deep=True)
    candidate.id = assessment_id
    candidate.created_at = created_at.astimezone(UTC)
    candidate.case_db_id = case_db_id
    candidate.parent_assessment_id = original.id
    # This full generation has a fresh JEV check for every textual target.
    # Human revisions remain available through the immutable parent snapshot.
    candidate.editorial_revision = None
    candidate.reading_guide = None
    candidate.executive_summary = output.draft.executive_summary
    candidate.scope = output.draft.scope
    candidate.summary_source_ids = output.draft.summary_source_ids
    for section in candidate.sections:
        if section.review_status in {"missing_information", "not_applicable"}:
            if sections[section.id].text != section.text:
                raise InvalidAIDraft(
                    "AI-udkastet må ikke ændre afsnit med manglende oplysninger eller uden relevans."
                )
            section.source_ids = sections[section.id].source_ids
            continue
        section.text = sections[section.id].text
        section.source = "ai_assisted"
        section.source_ids = sections[section.id].source_ids
    for risk in candidate.risks:
        proposal = risks[risk.id]
        risk.scenario = proposal.scenario
        risk.measures = proposal.measures
        risk.rationale = proposal.rationale
        risk.consequences = proposal.consequences
        risk.source_ids = proposal.source_ids
    candidate.additional_risks = [
        item.model_dump(mode="json") for item in output.draft.additional_risks
    ]
    candidate.recommendations = [
        item.model_copy(deep=True) for item in output.draft.recommendations
    ]
    candidate.open_questions = output.draft.open_questions
    candidate.ai_generation = {
        "model": output.model,
        "prompt_version": output.prompt_version,
        "review": output.review.model_dump(mode="json"),
        "usage": output.usage,
        "generated_at": candidate.created_at.isoformat(),
        "sources": [dict(item) for item in sources],
        "limitations": limitations or [],
        "human_review_required": True,
    }
    if batching is not None:
        candidate.ai_generation["batching"] = batching
    return DPIAAssessmentResponse.model_validate(candidate.model_dump(mode="json"))


def generate_dpia_draft(
    request: DPIAAssessmentRequest,
    result: DPIAAssessmentResponse,
    sources: list[dict[str, Any]],
    *,
    assessment_id: str,
    created_at: datetime,
    case_db_id: str,
    limitations: list[str] | None = None,
) -> DPIAAssessmentResponse:
    try:
        validate_source_budget(sources)
    except ValueError as exc:
        raise InvalidAIDraft(str(exc)) from exc
    # Past evidence snapshots are for audit, not recursive model context.
    worker_result = result.model_dump(
        mode="json", exclude={"ai_generation", "reading_guide"}
    )
    output = _run_worker(
        {
            "request": request.model_dump(mode="json"),
            "result": worker_result,
            "sources": sources,
        },
        timeout=GENERATION_TIMEOUT_SECONDS,
    )
    if requires_batching(sources) and output.get("batching") is None:
        raise InvalidAIDraft(
            "AI-kørslen mangler dokumentation for alle analysebatches. Den gemte vurdering er bevaret."
        )
    return apply_ai_draft(
        result,
        output,
        sources,
        assessment_id=assessment_id,
        created_at=created_at,
        case_db_id=case_db_id,
        limitations=limitations,
    )
