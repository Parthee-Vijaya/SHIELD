"""Document analyzer — runs the v3 rule engine over uploaded PDF/DOCX files.

Pipeline:
    1. parse_document() extracts plain text from PDF or DOCX, preserving
       page/section markers so the UI can highlight which part of the
       document triggered which rule.
    2. chunk_text() splits the full text into overlapping windows that
       fit within an LLM's context.
    3. analyze_document() runs the signal-extractor over each chunk and
       merges the resulting signals (caller-provided wins over LLM-derived;
       True wins over False when multiple chunks disagree on the same
       signal — "if any chunk says yes, treat as yes" is the safe default
       for compliance signals).
    4. evaluate_all() (from rule_engine.executor) is then called once on
       the merged signals to produce the same RuleDecision[] format as
       /api/v3/assess.

The deterministic part remains: the rule engine itself never sees the
raw document text. Only the signal-extractor does, and only one chunk
at a time, exactly as it does in the manual /api/v3/assess flow.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

from src.rule_engine.models import Rule, RuleInput, RuleDecision
from src.rule_engine.executor import evaluate_all, aggregate_status
from src.rule_engine.signal_extractor import (
    SignalExtractor,
    SignalExtractionError,
)

logger = logging.getLogger(__name__)


# ---- Data shapes -----------------------------------------------------------

@dataclass
class Chunk:
    """A piece of the document with a stable index for highlighting."""
    index: int
    text: str
    page: Optional[int] = None       # 1-indexed for PDFs, None for DOCX
    section: Optional[str] = None    # e.g. "Page 3" or "Paragraph 12"
    char_start: int = 0
    char_end: int = 0

    @property
    def label(self) -> str:
        if self.page is not None:
            return f"Side {self.page}"
        if self.section:
            return self.section
        return f"Chunk {self.index + 1}"


@dataclass
class ChunkSignals:
    """Signals extracted from one chunk + which rules they're for."""
    chunk: Chunk
    signals: dict[str, bool] = field(default_factory=dict)
    error: Optional[str] = None      # If extraction failed for this chunk


@dataclass
class AnalysisResult:
    """Full result of document analysis."""
    text_length: int
    chunk_count: int
    chunks: list[Chunk]
    chunk_signals: list[ChunkSignals]
    merged_signals: dict[str, bool]
    decisions: list[RuleDecision]
    aggregate_status: str
    rules_loaded: int
    warnings: list[str] = field(default_factory=list)
    # Predicates extracted by the M1.5 second LLM pass (only populated
    # when extract_predicates=True). Caller-supplied predicates are NOT
    # included here — only what the LLM derived from the document.
    extracted_predicates: dict[str, Any] = field(default_factory=dict)


# ---- Document parsing ------------------------------------------------------

class DocumentParseError(Exception):
    pass


def parse_pdf(content: bytes) -> tuple[str, list[tuple[int, int, int]]]:
    """Return full plain text + a list of (page_num, char_start, char_end)
    tuples so chunks can later be mapped back to a page."""
    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader  # fallback to legacy lib

    reader = PdfReader(io.BytesIO(content))
    parts: list[str] = []
    page_offsets: list[tuple[int, int, int]] = []
    cursor = 0
    for i, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:
            logger.warning("PDF page %d extraction failed: %s", i, exc)
            page_text = ""
        if not page_text.strip():
            continue
        normalized = page_text.strip() + "\n\n"
        parts.append(normalized)
        page_offsets.append((i, cursor, cursor + len(normalized)))
        cursor += len(normalized)
    return "".join(parts), page_offsets


def parse_docx(content: bytes) -> tuple[str, list[tuple[int, int, int]]]:
    """Return full plain text plus a list of (paragraph_num, start, end)."""
    from docx import Document

    doc = Document(io.BytesIO(content))
    parts: list[str] = []
    para_offsets: list[tuple[int, int, int]] = []
    cursor = 0
    for i, para in enumerate(doc.paragraphs, start=1):
        text = (para.text or "").strip()
        if not text:
            continue
        normalized = text + "\n\n"
        parts.append(normalized)
        para_offsets.append((i, cursor, cursor + len(normalized)))
        cursor += len(normalized)
    return "".join(parts), para_offsets


def parse_document(
    content: bytes, filename: str
) -> tuple[str, list[tuple[int, int, int]], str]:
    """Auto-detect format and return (text, offsets, kind) where
    kind is "pdf" or "docx"."""
    name = (filename or "").lower()
    if name.endswith(".pdf") or content[:4] == b"%PDF":
        text, offsets = parse_pdf(content)
        return text, offsets, "pdf"
    if name.endswith(".docx") or content[:2] == b"PK":
        text, offsets = parse_docx(content)
        return text, offsets, "docx"
    raise DocumentParseError(
        f"Unsupported file type: {filename}. Only .pdf and .docx are supported."
    )


# ---- Chunking --------------------------------------------------------------

def chunk_text(
    text: str,
    page_offsets: list[tuple[int, int, int]],
    *,
    chunk_size: int = 4000,
    overlap: int = 400,
) -> list[Chunk]:
    """Split text into overlapping windows. Each chunk gets a stable
    index and (when available) the page or paragraph number it starts on.

    chunk_size is in chars (a reasonable proxy for tokens — Danish text
    is ~3.5 chars/token). overlap helps prevent splitting a sentence
    across rule-relevant signals.
    """
    if not text:
        return []

    chunks: list[Chunk] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        # Try to break on a paragraph boundary if we're not at the end
        if end < n:
            paragraph_break = text.rfind("\n\n", start + chunk_size // 2, end)
            if paragraph_break > 0:
                end = paragraph_break

        chunk_text_str = text[start:end].strip()
        if chunk_text_str:
            page = _find_page(start, page_offsets)
            chunks.append(
                Chunk(
                    index=len(chunks),
                    text=chunk_text_str,
                    page=page if page is not None else None,
                    section=f"Side {page}" if page else None,
                    char_start=start,
                    char_end=end,
                )
            )

        if end >= n:
            break
        start = max(end - overlap, start + 1)

    return chunks


def _find_page(char_pos: int, offsets: list[tuple[int, int, int]]) -> Optional[int]:
    """Binary-search-friendly: which page/paragraph does char_pos fall on?"""
    for page, start, end in offsets:
        if start <= char_pos < end:
            return page
    return offsets[-1][0] if offsets else None


# ---- Signal extraction over chunks -----------------------------------------

def _merge_signals(
    chunk_signals: list[ChunkSignals],
) -> dict[str, bool]:
    """If any chunk yields signal=True, the merged value is True. False
    only wins when no chunk said True. This matches the safe-for-compliance
    default ("if any part of the doc trips a signal, treat the whole doc
    as tripping it")."""
    merged: dict[str, bool] = {}
    for cs in chunk_signals:
        for k, v in cs.signals.items():
            if v is True:
                merged[k] = True
            elif k not in merged:
                merged[k] = bool(v)
    return merged


def analyze_document(
    text: str,
    rules: list[Rule],
    page_offsets: list[tuple[int, int, int]],
    *,
    extractor: Optional[SignalExtractor] = None,
    extra_signals: Optional[dict[str, bool]] = None,
    extra_predicates: Optional[dict[str, Any]] = None,
    chunk_size: int = 4000,
    overlap: int = 400,
    extract_predicates: bool = True,
) -> AnalysisResult:
    """Full pipeline:

      1. Chunk the document
      2. Per chunk: extract trigger-signals via LLM
      3. Merge signals (True wins) + apply caller's extra_signals
      4. Evaluate rules → identify triggered rules
      5. (M1.5) For each triggered rule: extract predicate values from
         the FULL text via LLM. This lets a document upload alone produce
         a real BETINGET-GO/NO-GO without manual predicate input
      6. Merge extracted predicates with caller-supplied predicates
         (caller wins — they're explicit, LLM is best-effort)
      7. Re-evaluate rules with the enriched input
    """
    chunks = chunk_text(text, page_offsets, chunk_size=chunk_size, overlap=overlap)
    chunk_signals: list[ChunkSignals] = []
    warnings: list[str] = []

    if extractor is None:
        extractor = SignalExtractor()

    if not extractor.is_configured:
        warnings.append(
            "LLM signal-extractor is not configured — only caller-provided "
            "signals will drive rule evaluation. Set LM_STUDIO_BASE_URL or "
            "OPENAI_API_KEY in .env to enable LLM-based extraction over the "
            "document text."
        )

    # ---- Step 2: per-chunk signal extraction ----
    for chunk in chunks:
        if not extractor.is_configured:
            chunk_signals.append(ChunkSignals(chunk=chunk, signals={}, error=None))
            continue
        try:
            signals = extractor.extract(chunk.text, rules)
            bool_signals = {k: v for k, v in signals.items() if isinstance(v, bool)}
            chunk_signals.append(ChunkSignals(chunk=chunk, signals=bool_signals))
        except SignalExtractionError as exc:
            err = str(exc)
            warnings.append(f"chunk {chunk.label}: {err}")
            chunk_signals.append(ChunkSignals(chunk=chunk, signals={}, error=err))

    # ---- Step 3: merge signals ----
    merged_signals = _merge_signals(chunk_signals)
    if extra_signals:
        merged_signals.update(extra_signals)

    # ---- Step 4: first-pass evaluation to find triggered rules ----
    rule_input = RuleInput(
        signals=merged_signals,
        predicates=dict(extra_predicates or {}),
    )
    decisions_first_pass = evaluate_all(rules, rule_input)
    triggered = [d for d in decisions_first_pass if d.triggered]

    # ---- Step 5: M1.5 predicate extraction for triggered rules ----
    extracted_predicates: dict[str, Any] = {}
    if extract_predicates and extractor.is_configured and triggered:
        triggered_rule_ids = {d.rule_id for d in triggered}
        rules_by_id = {r.id: r for r in rules}
        for rule_id in triggered_rule_ids:
            rule = rules_by_id.get(rule_id)
            if rule is None or not rule.predikater:
                continue
            try:
                preds = extractor.extract_predicates_for_rule(text, rule)
                # Don't overwrite caller-supplied predicates
                for k, v in preds.items():
                    if k not in (extra_predicates or {}):
                        extracted_predicates[k] = v
            except SignalExtractionError as exc:
                warnings.append(f"predicate extraction failed for {rule_id}: {exc}")

    # ---- Step 6+7: merge predicates and re-evaluate ----
    final_predicates: dict[str, Any] = dict(extracted_predicates)
    if extra_predicates:
        final_predicates.update(extra_predicates)  # caller wins

    final_rule_input = RuleInput(
        signals=merged_signals,
        predicates=final_predicates,
    )
    decisions = evaluate_all(rules, final_rule_input)
    final_triggered = [d for d in decisions if d.triggered]
    agg = aggregate_status(final_triggered)

    return AnalysisResult(
        text_length=len(text),
        chunk_count=len(chunks),
        chunks=chunks,
        chunk_signals=chunk_signals,
        merged_signals=merged_signals,
        decisions=decisions,
        aggregate_status=agg,
        rules_loaded=len(rules),
        warnings=warnings,
        extracted_predicates=extracted_predicates,
    )


# ---- Per-chunk rule mapping (for UI highlighting) --------------------------

def chunk_rule_map(result: AnalysisResult, rules: list[Rule]) -> dict[int, list[str]]:
    """For each chunk index, return the rule_ids whose triggers were
    satisfied by signals extracted from that chunk specifically.

    Lets the UI draw a "this section of the document triggered rule X"
    highlight per chunk. Rules whose triggers depend on caller-supplied
    extra_signals are not attributed to any chunk."""
    rules_by_id = {r.id: r for r in rules}
    out: dict[int, list[str]] = {}
    for cs in result.chunk_signals:
        hits: list[str] = []
        for rule_id, rule in rules_by_id.items():
            for cond in (rule.trigger.any_of or []) + (rule.trigger.all_of or []):
                if cs.signals.get(cond.signal) is True:
                    hits.append(rule_id)
                    break
        if hits:
            out[cs.chunk.index] = sorted(set(hits))
    return out
