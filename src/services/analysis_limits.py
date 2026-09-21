"""Shared evidence budgets; model batches never discard the rest of a case."""

import os
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# These are model-call budgets, not whole-case truncation limits.
MAX_DOCUMENTS = 25
MAX_TOTAL_TEXT_CHARS = 500_000
MAX_DOCUMENT_TEXT_CHARS = 200_000
MAX_TOTAL_EXCERPTS = 1_000
MAX_DOCUMENT_EXCERPTS = 500
MAX_CASE_DOCUMENTS = 100
MAX_CASE_TEXT_CHARS = 5_000_000
MAX_CASE_EXCERPTS = 10_000
MAX_BATCHES = 20
MAX_EXTRACTION_TEXT_CHARS = 2_000_000
MAX_EXTRACTION_SEGMENTS = 5_000
MAX_SOURCE_PACK_CHARS = 16_000_000
MAX_RAW_INPUT_CHARS = 20_000_000


def _analysis_timeout() -> int:
    try:
        return min(
            3600, max(600, int(os.getenv("AI_ANALYSIS_TIMEOUT_SECONDS", "1800")))
        )
    except ValueError:
        return 1800


ANALYSIS_TIMEOUT_SECONDS = _analysis_timeout()


def danish_number(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def public_analysis_limits() -> dict[str, int | bool]:
    from src.services.safe_public_fetch import MAX_SOURCE_BYTES

    return {
        "max_documents": MAX_DOCUMENTS,
        "max_total_text_chars": MAX_TOTAL_TEXT_CHARS,
        "max_document_text_chars": MAX_DOCUMENT_TEXT_CHARS,
        "max_total_excerpts": MAX_TOTAL_EXCERPTS,
        "max_document_excerpts": MAX_DOCUMENT_EXCERPTS,
        "max_file_bytes": MAX_SOURCE_BYTES,
        "batching_enabled": True,
        "max_batches": MAX_BATCHES,
        "max_case_documents": MAX_CASE_DOCUMENTS,
        "max_case_text_chars": MAX_CASE_TEXT_CHARS,
        "max_case_excerpts": MAX_CASE_EXCERPTS,
        "max_extraction_text_chars": MAX_EXTRACTION_TEXT_CHARS,
        "max_extraction_segments": MAX_EXTRACTION_SEGMENTS,
    }


def source_document_id(source: dict) -> str | None:
    return source.get("document_version_id") or (
        source["id"].split(":")[1]
        if source.get("id", "").startswith("document:")
        else None
    )


def validate_source_budget(sources: list[dict]) -> None:
    """Fail a complete run before calling a model; never return a partial pool."""
    documents = {source_document_id(source) for source in sources} - {None}
    if (
        len(documents) > MAX_CASE_DOCUMENTS
        or len(sources) > MAX_CASE_EXCERPTS
        or sum(len(source["text"]) for source in sources) > MAX_CASE_TEXT_CHARS
    ):
        raise ValueError(
            "Kildematerialet overskrider den samlede sikkerhedsgrænse på "
            f"{MAX_CASE_DOCUMENTS} dokumenter, {danish_number(MAX_CASE_TEXT_CHARS)} tegn "
            f"og {danish_number(MAX_CASE_EXCERPTS)} kildeuddrag. "
            "Ingen delvis analyse er gemt. Afgræns sagen eller fordel den i flere sager."
        )
    if any(len(source["text"]) > MAX_DOCUMENT_TEXT_CHARS for source in sources):
        raise ValueError(
            "Et kildeuddrag er for stort til en analysebatch. Ingen delvis analyse er gemt."
        )
    document_ids: set[str] = set()
    batches, count, chars = 1, 0, 0
    for source in sources:
        document = source_document_id(source)
        next_ids = document_ids | ({document} if document else set())
        if count and (
            count >= MAX_TOTAL_EXCERPTS
            or chars + len(source["text"]) > MAX_TOTAL_TEXT_CHARS
            or len(next_ids) > MAX_DOCUMENTS
        ):
            batches += 1
            count, chars, document_ids = 0, 0, set()
            next_ids = {document} if document else set()
        count += 1
        chars += len(source["text"])
        document_ids = next_ids
    if batches > MAX_BATCHES:
        raise ValueError(
            f"Kildematerialet kræver over {MAX_BATCHES} analysebatches. Ingen delvis analyse er gemt."
        )


def requires_batching(sources: list[dict]) -> bool:
    return (
        len(sources) > MAX_TOTAL_EXCERPTS
        or sum(len(source["text"]) for source in sources) > MAX_TOTAL_TEXT_CHARS
        or len({source_document_id(source) for source in sources} - {None})
        > MAX_DOCUMENTS
    )


class AnalysisBatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    index: int = Field(ge=1, le=MAX_BATCHES)
    source_ids: list[str] = Field(min_length=1, max_length=MAX_TOTAL_EXCERPTS)
    source_text_chars: int = Field(ge=1, le=MAX_TOTAL_TEXT_CHARS)
    document_count: int = Field(ge=0, le=MAX_DOCUMENTS)
    summary: str | None = Field(default=None, max_length=8000)
    fact_count: int | None = Field(default=None, ge=0, le=1000)
    conflict_count: int | None = Field(default=None, ge=0, le=1000)
    question_count: int | None = Field(default=None, ge=0, le=1000)
    finding_count: int | None = Field(default=None, ge=0, le=1000)


class BatchingMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    strategy: Literal["single-pass-v1", "map-reduce-v1"]
    batch_count: int = Field(ge=1, le=MAX_BATCHES)
    source_count: int = Field(ge=1, le=MAX_CASE_EXCERPTS)
    source_text_chars: int = Field(ge=1, le=MAX_CASE_TEXT_CHARS)
    batches: list[AnalysisBatch] = Field(min_length=1, max_length=MAX_BATCHES)
    map_call_count: int = Field(ge=0, le=MAX_BATCHES)
    synthesis_call_count: int = Field(ge=1, le=2)
    cross_batch_conflict_count: int | None = Field(default=None, ge=0, le=1000)
    consolidation_note: str | None = Field(default=None, max_length=8000)


def validate_batching_metadata(raw: Any, sources: list[dict]) -> dict | None:
    if raw is None:
        return None  # Historical and locally drafted imports have no model batch trace.
    metadata = BatchingMetadata.model_validate(raw)
    lookup = {source["id"]: source for source in sources}
    covered = [
        identifier for batch in metadata.batches for identifier in batch.source_ids
    ]
    if (
        len(lookup) != len(sources)
        or len(covered) != len(set(covered))
        or set(covered) != set(lookup)
        or metadata.batch_count != len(metadata.batches)
        or metadata.source_count != len(sources)
        or metadata.source_text_chars != sum(len(source["text"]) for source in sources)
        or [batch.index for batch in metadata.batches]
        != list(range(1, metadata.batch_count + 1))
        or metadata.strategy
        != ("map-reduce-v1" if metadata.batch_count > 1 else "single-pass-v1")
        or metadata.map_call_count
        != (metadata.batch_count if metadata.batch_count > 1 else 0)
    ):
        raise ValueError("Batchoversigten dækker ikke præcis hele kildegrundlaget.")
    for batch in metadata.batches:
        batch_sources = [lookup[identifier] for identifier in batch.source_ids]
        if batch.source_text_chars != sum(
            len(source["text"]) for source in batch_sources
        ) or batch.document_count != len(
            {source_document_id(source) for source in batch_sources} - {None}
        ):
            raise ValueError(
                "Batchoversigtens kildeantal eller tekstmængde er ugyldig."
            )
    return metadata.model_dump(mode="json", exclude_none=True)
