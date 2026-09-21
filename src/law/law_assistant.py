"""Law AI Assistant — RAG-grounded answers with citations.

Provider chain: Azure OpenAI → OpenAI → LM Studio (local). Falls through
when keys are missing or look like .env.example placeholders. Same chain
as src/services/law_rag.py so the index and the answerer stay in sync.

Features:
- Hybrid retrieval (RAG when index is built, keyword otherwise)
- Source dedup by law slug — RAG-chunks from the same law are merged
  into a single source with multiple "passages" of evidence
- Structured JSON answer with citations + key points + follow-up suggestions
- Streaming variant (ask_stream) yields prose deltas + final structured payload
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List, Optional

from dotenv import load_dotenv

from .law_data import search_laws, get_law_by_slug

load_dotenv()
logger = logging.getLogger(__name__)


_PLACEHOLDER_FRAGMENTS = ("your_", "_here", "sk-...", "changeme")


def _is_placeholder(value: Optional[str]) -> bool:
    if not value:
        return True
    low = value.lower()
    return any(frag in low for frag in _PLACEHOLDER_FRAGMENTS)


# ---- Source dedup ----------------------------------------------------------

@dataclass
class _Passage:
    text: str
    chunk_index: int
    similarity: Optional[float] = None


def _dedupe_sources(rag_hits: list[dict]) -> list[dict]:
    """Group RAG chunks by law_slug into one source per law.

    Multiple matching passages from the same law become a single source
    with a 'passages' list, sorted by similarity desc. Avoids the "[1]
    Aktivloven § 1, [2] Aktivloven § 1, [3] Aktivloven § 1" duplication
    problem in answers.
    """
    by_slug: dict[str, dict] = {}
    for hit in rag_hits:
        slug = hit["law_slug"]
        passage = _Passage(
            text=hit["text"],
            chunk_index=hit["chunk_index"],
            similarity=hit.get("similarity"),
        )
        if slug not in by_slug:
            full = get_law_by_slug(slug) or {}
            by_slug[slug] = {
                "title": hit["law_title"],
                "slug": slug,
                "url": hit["law_url"] or full.get("url", ""),
                "summary": full.get("summary", ""),
                "law_number": full.get("lawNumber", "") or full.get("law_number", ""),
                "passages": [],
                "_max_similarity": 0.0,
            }
        by_slug[slug]["passages"].append(passage)
        sim = passage.similarity or 0.0
        by_slug[slug]["_max_similarity"] = max(by_slug[slug]["_max_similarity"], sim)

    # Sort sources by best similarity, passages within each by similarity
    sources = list(by_slug.values())
    for s in sources:
        s["passages"].sort(
            key=lambda p: (p.similarity or 0.0), reverse=True
        )
        # Concatenate passages into a single 'content' field for prompt building
        s["content"] = "\n\n— —\n\n".join(p.text for p in s["passages"][:3])
        s["passage_count"] = len(s["passages"])
        s["best_similarity"] = round(s.pop("_max_similarity"), 3)
        # Keep passages as plain dicts in the API response
        s["passages"] = [
            {
                "text": p.text,
                "chunk_index": p.chunk_index,
                "similarity": round(p.similarity, 3) if p.similarity is not None else None,
            }
            for p in s["passages"]
        ]
    sources.sort(key=lambda s: s["best_similarity"], reverse=True)
    return sources


# ---- Retrieval -------------------------------------------------------------

def _retrieve_sources(
    query: str,
    category: Optional[str],
    max_sources: int,
    mode: str,
) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Pick retriever and return (sources, retrieval_info).

    RAG returns chunks (deduped by law); keyword returns whole laws.
    """
    from src.services.law_rag import get_default_index

    wants_rag = mode in ("auto", "rag")

    if wants_rag:
        index = get_default_index()
        if index.is_ready():
            try:
                # Pull more than max_sources at the chunk level so dedup-by-law
                # has a wider pool to work with
                hits = index.search(query, top_k=max(max_sources * 2, 8))
                sources = _dedupe_sources(hits)[:max_sources]
                return sources, {
                    "mode": "rag",
                    "provider": index.stats().get("provider"),
                    "matched_chunks": len(hits),
                    "matched_laws": len(sources),
                }
            except Exception as exc:
                logger.warning(f"Law RAG search failed, falling back to keyword: {exc}")
                if mode == "rag":
                    raise

    # Keyword fallback
    results = search_laws(query, category=category, limit=max_sources)
    sources = []
    for r in results:
        law = r["law"]
        sources.append({
            "title": law.get("title", "Ukendt lov"),
            "slug": law.get("slug", ""),
            "url": law.get("url", ""),
            "summary": law.get("summary", ""),
            "law_number": law.get("lawNumber", "") or law.get("law_number", ""),
            "content": law.get("content", "")[:2400],  # Truncate to fit prompt
            "passages": [],
            "passage_count": 0,
            "best_similarity": None,
            "_keyword_relevance": r.get("relevance"),
        })
    return sources, {
        "mode": "keyword",
        "matched_laws": len(sources),
        "fallback": mode == "auto",
    }


# ---- LLM provider ----------------------------------------------------------

class _LLMProvider:
    """Picks Azure OpenAI → OpenAI → LM Studio for chat completions.

    Use as a normal class (no async context manager). All calls return sync
    results because OpenAI SDK is sync — wrap in asyncio.to_thread when on
    the request path.
    """

    def __init__(self) -> None:
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_api_version = os.getenv("OPENAI_API_VERSION", "2024-02-15-preview")
        self.azure_deployment = os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o-mini")

        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        self.lm_studio_url = os.getenv("LM_STUDIO_BASE_URL", "").rstrip("/")
        self.lm_studio_model = os.getenv(
            "LM_STUDIO_CHAT_MODEL", os.getenv("LM_STUDIO_MODEL", "")
        )

        if self.azure_endpoint and not _is_placeholder(self.azure_api_key):
            self.provider = "azure"
        elif not _is_placeholder(self.openai_api_key):
            self.provider = "openai"
        elif self.lm_studio_url:
            self.provider = "lm_studio"
        else:
            self.provider = None

    def is_configured(self) -> bool:
        return self.provider is not None

    def label(self) -> str:
        return self.provider or "none"

    def _client(self):
        if self.provider == "azure":
            from openai import AzureOpenAI
            return AzureOpenAI(
                api_key=self.azure_api_key,
                api_version=self.azure_api_version,
                azure_endpoint=self.azure_endpoint,
            )
        if self.provider == "openai":
            from openai import OpenAI
            return OpenAI(api_key=self.openai_api_key)
        if self.provider == "lm_studio":
            from openai import OpenAI
            return OpenAI(api_key="lm-studio", base_url=self.lm_studio_url)
        raise RuntimeError(
            "No LLM provider configured — set AZURE_OPENAI_API_KEY, "
            "OPENAI_API_KEY, or LM_STUDIO_BASE_URL"
        )

    def _model(self) -> str:
        if self.provider == "azure":
            return self.azure_deployment
        if self.provider == "openai":
            return self.openai_model
        if self.provider == "lm_studio":
            # Fall back to the first loaded chat model when LM_STUDIO_MODEL isn't set.
            if self.lm_studio_model:
                return self.lm_studio_model
            try:
                client = self._client()
                models = client.models.list()
                for m in models.data:
                    name = getattr(m, "id", "")
                    if "embed" in name.lower():
                        continue
                    return name
            except Exception:
                pass
            return "auto"
        return "unknown"

    def _supports_json_mode(self) -> bool:
        # LM Studio's response_format support varies by model; safest to disable
        return self.provider in {"azure", "openai"}

    def chat(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.3,
        max_tokens: int = 1800,
        json_mode: bool = False,
    ) -> str:
        client = self._client()
        kwargs: dict[str, Any] = {
            "model": self._model(),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode and self._supports_json_mode():
            kwargs["response_format"] = {"type": "json_object"}
        resp = client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def stream_chat(
        self,
        *,
        system: str,
        user: str,
        temperature: float = 0.3,
        max_tokens: int = 1800,
    ):
        """Yield (delta_text, finish_reason) tuples. Sync generator."""
        client = self._client()
        stream = client.chat.completions.create(
            model=self._model(),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        for event in stream:
            choice = event.choices[0] if event.choices else None
            if choice is None:
                continue
            delta = choice.delta.content or ""
            yield delta, choice.finish_reason


# ---- Prompts ---------------------------------------------------------------

_SYSTEM_PROMPT = """Du er S.H.I.E.L.D. — en dansk juridisk AI-assistent for kommunal sagsbehandling.

Stil: præcis, kortfattet, embedsmandsdansk uden floskler. Hver påstand skal kunne hjemles i en konkret lovparagraf der er sendt til dig som kontekst.

Faste regler:
1. Svar KUN på baggrund af lovparagrafferne i konteksten — gæt aldrig.
2. Når du citerer eller henviser til en lov, brug formatet [N] hvor N er kildens nummer i konteksten.
3. Citér ordret hvor relevant — sæt citater i »danske gåseøjne«.
4. Hvis konteksten ikke besvarer spørgsmålet entydigt: sig det direkte og foreslå hvad sagsbehandleren bør gøre (kontakt jurist, læs anden lov, indhent oplysninger).
5. Skriv aldrig "som en AI-model" eller lignende.
6. Maks 4 afsnit prosa. Brug nøglepunkter til lister.

OUTPUT-FORMAT (følg præcist — hver sektion skal være med, også selvom den er tom):

[hovedsvar i prosa, max 4 afsnit, brug [N]-citationer]

NØGLEPUNKTER:
- punkt 1
- punkt 2
- punkt 3

OPFØLGNING:
- foreslået opfølgningsspørgsmål 1?
- foreslået opfølgningsspørgsmål 2?

Sektionerne SKAL have de eksakte overskrifter "NØGLEPUNKTER:" og "OPFØLGNING:" på egen linje.
"""


def _build_user_prompt(query: str, sources: list[dict]) -> str:
    context_parts = []
    for idx, source in enumerate(sources, start=1):
        title = source.get("title", "Ukendt lov")
        law_number = source.get("law_number", "")
        url = source.get("url", "")
        content = source.get("content") or source.get("summary", "")
        passage_count = source.get("passage_count", 0)
        sim = source.get("best_similarity")
        meta_bits = []
        if law_number:
            meta_bits.append(f"Lovnr {law_number}")
        if passage_count:
            meta_bits.append(f"{passage_count} relevante passager")
        if sim is not None:
            meta_bits.append(f"semantisk match {sim}")
        meta = " · ".join(meta_bits)

        context_parts.append(
            f"""[{idx}] {title}{f' ({meta})' if meta else ''}
URL: {url}

{content[:2400]}"""
        )

    context = "\n\n---\n\n".join(context_parts)

    return f"""Spørgsmål fra sagsbehandler:
{query}

Relevante lovparagraffer (rangeret efter relevans):
{context}

Besvar spørgsmålet baseret på paragrafferne ovenfor."""


_STRUCTURED_INSTRUCTIONS = """

Returnér KUN gyldigt JSON på følgende form:
{
  "answer": "Prosasvar med [N]-citationer, max 4 afsnit",
  "confidence": 0.85,
  "key_points": ["Konkret punkt 1", "Konkret punkt 2", "Konkret punkt 3"],
  "citations": [
    {"source_index": 1, "quote": "Direkte citat fra lovparagraffen"}
  ],
  "follow_up_questions": [
    "Foreslået opfølgning 1?",
    "Foreslået opfølgning 2?"
  ]
}

Skriv intet andet end JSON."""


# ---- Public API ------------------------------------------------------------

class LawAssistant:
    """Stateless assistant — no per-instance state needed.

    Kept as a class for API compatibility with callers using
    `async with LawAssistant() as a:`. The async context manager is now
    a no-op; provider state is per-call.
    """

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None

    # -- non-streaming --

    async def ask(
        self,
        query: str,
        category: Optional[str] = None,
        max_sources: int = 5,
        mode: str = "auto",
    ) -> Dict[str, Any]:
        """Non-streaming wrapper — internally uses the same streaming
        pipeline and accumulates events into a final dict. Avoids two
        divergent code paths and fragile JSON parsing of the prose.
        """
        accumulated: Dict[str, Any] = {
            "answer": "",
            "confidence": 0.0,
            "key_points": [],
            "citations": [],
            "follow_up_questions": [],
            "sources": [],
            "retrieval": None,
            "provider": "none",
        }
        async for event in self.ask_stream(query, category, max_sources, mode):
            etype = event.get("event")
            if etype == "retrieval":
                accumulated["sources"] = event.get("sources", [])
                accumulated["retrieval"] = event.get("retrieval")
            elif etype == "delta":
                accumulated["answer"] += event.get("text", "")
            elif etype == "final":
                # Final event may carry the canonical answer (in fallback
                # cases) — prefer it over delta-accumulation if present.
                if event.get("answer"):
                    accumulated["answer"] = event["answer"]
                accumulated["confidence"] = event.get("confidence", 0.7)
                accumulated["key_points"] = event.get("key_points", [])
                accumulated["citations"] = event.get("citations", [])
                accumulated["follow_up_questions"] = event.get("follow_up_questions", [])
                accumulated["provider"] = event.get("provider", accumulated["provider"])
            elif etype == "error":
                accumulated["error"] = event.get("message")
        return accumulated

    # -- streaming --

    async def ask_stream(
        self,
        query: str,
        category: Optional[str] = None,
        max_sources: int = 5,
        mode: str = "auto",
    ) -> AsyncIterator[dict]:
        """Yield dict events: retrieval → delta(s) → final.

        Frontend can render the answer prose as it arrives, then merge in
        the structured fields once the final event lands.
        """
        sources, retrieval_info = await asyncio.to_thread(
            _retrieve_sources, query, category, max_sources, mode
        )

        yield {"event": "retrieval", "sources": sources, "retrieval": retrieval_info}

        if not sources:
            yield {
                "event": "final",
                "answer": "Jeg kunne ikke finde relevante love for dit spørgsmål.",
                "confidence": 0.0,
                "key_points": [],
                "citations": [],
                "follow_up_questions": [],
            }
            return

        provider = _LLMProvider()
        if not provider.is_configured():
            fallback = _fallback_answer(sources)
            yield {"event": "delta", "text": fallback["answer"]}
            yield {
                "event": "final",
                "answer": fallback["answer"],
                "confidence": fallback["confidence"],
                "key_points": fallback["key_points"],
                "citations": [],
                "follow_up_questions": [],
                "provider": "none",
            }
            return

        # Stream the full output (prose + sectioned tails) and split sections
        # locally — single LLM call, no fragile postprocess.
        prose_parts: list[str] = []
        in_main = True  # everything before NØGLEPUNKTER: is the main answer
        try:
            queue: asyncio.Queue = asyncio.Queue()

            def producer():
                try:
                    for delta, _ in provider.stream_chat(
                        system=_SYSTEM_PROMPT,
                        user=_build_user_prompt(query, sources),
                        max_tokens=2000,
                    ):
                        if delta:
                            asyncio.run_coroutine_threadsafe(
                                queue.put({"event": "delta", "text": delta}), loop
                            )
                    asyncio.run_coroutine_threadsafe(queue.put(None), loop)
                except Exception as exc:  # pragma: no cover
                    asyncio.run_coroutine_threadsafe(
                        queue.put({"event": "error", "message": str(exc)}), loop
                    )
                    asyncio.run_coroutine_threadsafe(queue.put(None), loop)

            loop = asyncio.get_running_loop()
            task = asyncio.to_thread(producer)
            asyncio.create_task(task)

            buf = ""  # rolling buffer for boundary detection
            while True:
                item = await queue.get()
                if item is None:
                    break
                if item.get("event") != "delta":
                    yield item
                    continue
                text = item["text"]
                prose_parts.append(text)

                if in_main:
                    buf += text
                    # Look for the section boundary; emit everything up to it
                    idx = buf.find("NØGLEPUNKTER:")
                    if idx == -1:
                        # Don't yield the last few chars yet (boundary may
                        # span this delta + next one). Emit safely.
                        safe_len = max(0, len(buf) - 14)
                        if safe_len > 0:
                            yield {"event": "delta", "text": buf[:safe_len]}
                            buf = buf[safe_len:]
                    else:
                        # Emit pre-boundary, then stop streaming prose
                        if idx > 0:
                            yield {"event": "delta", "text": buf[:idx]}
                        in_main = False
                        buf = ""
                # After boundary: don't emit delta events; sections are
                # parsed once full output is available.

        except Exception as exc:
            logger.exception(f"streaming chat failed: {exc}")
            yield {"event": "error", "message": str(exc)}
            return

        full_text = "".join(prose_parts).strip()
        parsed = _parse_sectioned_output(full_text)

        yield {
            "event": "final",
            "answer": parsed["main"],
            "confidence": parsed.get("confidence", 0.75),
            "key_points": parsed["key_points"],
            "citations": [],
            "follow_up_questions": parsed["follow_up_questions"],
            "provider": provider.label(),
        }


# ---- Internals -------------------------------------------------------------

_FENCE_RE = re.compile(r"```(?:json)?\s*|```", re.IGNORECASE)


_SECTION_KEYPOINTS = re.compile(r"^N[ØO]GLEPUNKTER:\s*$", re.IGNORECASE | re.MULTILINE)
_SECTION_FOLLOWUPS = re.compile(r"^OPF[ØO]LGNING(?:SSP[ØO]RGSM[AÅ]L)?:\s*$", re.IGNORECASE | re.MULTILINE)


def _parse_sectioned_output(text: str) -> dict:
    """Split LLM output into main prose / key_points / follow_ups.

    The LLM is instructed to emit two literal section headers. If they're
    missing (some smaller models drop them), we fall back to using the
    full text as the main answer with empty lists.
    """
    if not text:
        return {"main": "", "key_points": [], "follow_up_questions": [], "confidence": 0.4}

    # Find section boundaries
    kp_match = _SECTION_KEYPOINTS.search(text)
    fu_match = _SECTION_FOLLOWUPS.search(text)

    if kp_match:
        main = text[: kp_match.start()].strip()
        kp_start = kp_match.end()
        if fu_match and fu_match.start() > kp_match.end():
            kp_block = text[kp_start : fu_match.start()]
            fu_block = text[fu_match.end() :]
        else:
            kp_block = text[kp_start:]
            fu_block = ""
    else:
        # No sections — treat the whole thing as the main answer
        return {
            "main": text.strip(),
            "key_points": [],
            "follow_up_questions": [],
            "confidence": 0.7,
        }

    key_points = _parse_bullets(kp_block)
    follow_ups = _parse_bullets(fu_block)

    return {
        "main": main,
        "key_points": key_points[:8],
        "follow_up_questions": follow_ups[:5],
        "confidence": 0.85 if key_points else 0.7,
    }


def _parse_bullets(block: str) -> list[str]:
    """Pull bullet lines from a block. Tolerates -, *, • or numbered prefixes."""
    if not block:
        return []
    lines = block.strip().split("\n")
    bullets = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        # Strip common bullet markers
        stripped = re.sub(r"^[\-\*\•]+\s*", "", ln)
        stripped = re.sub(r"^\d+\.\s*", "", stripped)
        stripped = stripped.strip()
        if stripped and not stripped.endswith(":"):
            bullets.append(stripped)
    return bullets


def _extract_json(text: str) -> Optional[dict]:
    """Pull a JSON object out of LLM output. Tolerates code fences + prose."""
    if not text:
        return None
    cleaned = _FENCE_RE.sub("", text).strip()
    # First try whole string
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    # Find the outermost {...}
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except Exception:
            pass
    return None


def _generate_answer_sync(
    provider: _LLMProvider, query: str, sources: list[dict]
) -> dict:
    """Sync (thread-safe) one-shot answer generator. Returns the same
    fields the API contract expects."""
    user = _build_user_prompt(query, sources) + _STRUCTURED_INSTRUCTIONS
    raw = provider.chat(
        system=_SYSTEM_PROMPT,
        user=user,
        json_mode=True,
        max_tokens=2000,
    )

    parsed = _extract_json(raw) or {}
    answer = parsed.get("answer") or raw[:2000] or "Intet svar genereret."
    confidence = float(parsed.get("confidence", 0.75) or 0.75)
    key_points = parsed.get("key_points") or []
    citations = parsed.get("citations") or []
    follow_ups = parsed.get("follow_up_questions") or []

    return {
        "answer": str(answer),
        "confidence": min(max(confidence, 0.0), 1.0),
        "key_points": [str(p) for p in key_points if p][:8],
        "citations": [
            {
                "source_index": int(c.get("source_index", 0) or 0),
                "quote": str(c.get("quote") or c.get("text") or ""),
            }
            for c in citations
            if isinstance(c, dict)
        ][:10],
        "follow_up_questions": [str(q) for q in follow_ups if q][:4],
    }


def _structured_postprocess(
    provider: _LLMProvider, query: str, sources: list[dict], prose: str
) -> dict:
    """Second small call: ask the model to derive structured fields from
    its own prose answer. Cheap (~200 tokens out)."""
    extract_prompt = f"""Spørgsmål: {query}

AI-svar:
{prose}

Konteksten havde {len(sources)} kilder ([1]–[{len(sources)}]).

Returnér KUN gyldigt JSON:
{{
  "confidence": 0.85,
  "key_points": ["3-5 konkrete pointer fra svaret"],
  "citations": [
    {{"source_index": 1, "quote": "Direkte citat fra svaret eller kilden"}}
  ],
  "follow_up_questions": [
    "2-3 forslag til opfølgningsspørgsmål en sagsbehandler ville stille"
  ]
}}"""
    raw = provider.chat(
        system="Du udtrækker struktureret data fra et juridisk svar. Returnér kun JSON.",
        user=extract_prompt,
        json_mode=True,
        max_tokens=600,
    )
    parsed = _extract_json(raw) or {}
    return {
        "confidence": float(parsed.get("confidence", 0.75) or 0.75),
        "key_points": [str(p) for p in (parsed.get("key_points") or []) if p][:8],
        "citations": [
            {
                "source_index": int(c.get("source_index", 0) or 0),
                "quote": str(c.get("quote") or c.get("text") or ""),
            }
            for c in (parsed.get("citations") or [])
            if isinstance(c, dict)
        ][:10],
        "follow_up_questions": [
            str(q) for q in (parsed.get("follow_up_questions") or []) if q
        ][:4],
    }


def _fallback_answer(sources: list[dict]) -> Dict[str, Any]:
    """Used when no LLM is configured. Show the raw passages so the user
    at least sees what the retriever found."""
    parts = ["**Ingen LLM konfigureret** — viser de fundne lov-passager direkte:\n"]
    for idx, source in enumerate(sources, start=1):
        title = source.get("title", "Ukendt lov")
        passages = source.get("passages") or []
        if passages:
            preview = passages[0]["text"][:280]
        else:
            preview = (source.get("content") or source.get("summary", ""))[:280]
        parts.append(f"[{idx}] **{title}**\n> {preview}…")

    return {
        "answer": "\n\n".join(parts),
        "confidence": 0.4,
        "key_points": [
            "Sæt AZURE_OPENAI_API_KEY, OPENAI_API_KEY eller LM_STUDIO_BASE_URL i .env",
            "Konsultér en jurist for juridisk rådgivning",
        ],
        "citations": [],
        "follow_up_questions": [],
        "sources": sources,
    }
