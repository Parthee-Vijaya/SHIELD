"""Automatisk vidensbase-opdatering — Tyr-stil.

Kører ugentligt (mandag 03:00) og:

1. Henter en seed-liste af kandidat-termer (fra recent_queries hvis givet,
   eller default-listen af aktuelle 2025-2026 emner).
2. Filtrerer termer der allerede findes.
3. Genererer for hver ny term en kort definition + kontekst via samme
   LLM provider chain Tyr bruger andre steder (Azure → OpenAI → LM Studio
   med placeholder-detektion).
4. Skriver entries med ENSARTET skema — samme felter som de håndkurerede
   entries (id, term, category, iconKey, definition, context, tags,
   references). Plus auto_generated=true + added_at.
5. Begrænser til max 5 nye termer per kørsel for at holde kvalitet.

Ingen WebSearcher-afhængighed længere — den var koblet til en del web-
research-agenter der kun virker med ChatOpenAI/ChatAnthropic. LM Studios
nyhedsindekserede prætrænings-data kan ikke følge med, så dette er
acceptabelt: terminologien ændrer sig ikke hurtigere end den ugentlige
kørsel kan håndtere via den seedede default-liste.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, UTC
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

# Load .env so the module also works når kørt direkte (uden main.py).
load_dotenv()

logger = logging.getLogger(__name__)

KNOWLEDGE_BASE_PATH = Path(__file__).parent.parent.parent / "data" / "knowledge_base.json"

# Default ikon hvis LLM ikke kan vælge en passende — falder tilbage til
# en neutral 'document'-ikon der altid passer.
_DEFAULT_ICON = "FaFileAlt"

# Lovlige kategorier — matcher det frontend forventer.
_CATEGORIES = ("legal", "compliance", "ai", "operations")

# Seed-liste af termer der ofte er aktuelle i 2025-2026 men måske ikke
# allerede er i basen. Filtreres mod eksisterende termer før LLM-kald.
_DEFAULT_SEED_TERMS = [
    "AI red teaming",
    "AI watermarking",
    "Deepfake disclosure (AI Act Art. 50)",
    "Algorithmic auditing",
    "EU AI Office",
    "GPAI Code of Practice",
    "AI Pact (frivillig forpligtelse)",
    "FRIA template (AI Office)",
    "Differential privacy",
    "Federated learning",
    "Model card",
    "Datablad (Datasheet for Datasets)",
    "AI value chain (AI Act Art. 25)",
    "Substantial modification",
    "Post-market monitoring (AI Act Art. 72)",
    "Serious incident reporting (AI Act Art. 73)",
    "Prompt engineering governance",
    "Evals (AI evaluations)",
    "Constitutional AI",
    "AI red teaming exercises",
    "Hallucination detection",
    "Tool-use auditing",
    "Multi-agent orchestration",
    "AI safety institute (UK / US AISI)",
    "Bletchley Declaration",
]


# ---- Provider chain (matcher law_assistant og law_rag) ---------------------


_PLACEHOLDER_FRAGMENTS = ("your_", "_here", "sk-...", "changeme")


def _is_placeholder(value: Optional[str]) -> bool:
    if not value:
        return True
    low = value.lower()
    return any(frag in low for frag in _PLACEHOLDER_FRAGMENTS)


class _LLMProvider:
    """Azure OpenAI → OpenAI → LM Studio for chat completions.

    Identical pattern til src/law/law_assistant.py så vi har én konsistent
    måde at finde en LLM på i Tyr.
    """

    def __init__(self) -> None:
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_api_version = os.getenv("OPENAI_API_VERSION", "2024-02-15-preview")
        self.azure_deployment = os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o-mini")

        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        self.lm_studio_url = os.getenv("LM_STUDIO_BASE_URL", "").rstrip("/")
        self.lm_studio_model = os.getenv("LM_STUDIO_CHAT_MODEL", os.getenv("LM_STUDIO_MODEL", ""))

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
        raise RuntimeError("No LLM provider configured")

    def _model(self) -> str:
        if self.provider == "azure":
            return self.azure_deployment
        if self.provider == "openai":
            return self.openai_model
        if self.provider == "lm_studio":
            if self.lm_studio_model:
                return self.lm_studio_model
            # Auto-pick: prefer gpt-oss first (more reliable for short
            # structured outputs), then any non-embed model. Gemma-4 has
            # been observed returning empty content on stricter system
            # prompts so it's deprioritised.
            try:
                client = self._client()
                models = [getattr(m, "id", "") for m in client.models.list().data]
                non_embed = [m for m in models if m and "embed" not in m.lower()]
                # Preference order: gpt-oss → openai/* → others → gemma
                preference = sorted(
                    non_embed,
                    key=lambda m: (
                        0 if "gpt-oss" in m.lower() else
                        1 if m.lower().startswith("openai/") else
                        3 if "gemma" in m.lower() else
                        2
                    ),
                )
                if preference:
                    return preference[0]
            except Exception:
                pass
            return "auto"
        return "unknown"

    def chat(self, *, system: str, user: str, max_tokens: int = 600) -> str:
        """Kald chat completion. Hvis primær model giver tom respons (kendt
        Gemma-issue) prøver vi auto-pick fallback én gang."""
        client = self._client()
        primary = self._model()
        for attempt, model in enumerate(self._model_candidates(primary)):
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=float(os.getenv("KB_UPDATER_TEMPERATURE", "0.3")),
                    max_tokens=max_tokens,
                )
                content = (resp.choices[0].message.content or "").strip()
                if content:
                    if attempt > 0:
                        logger.info(f"KB updater fell back to model {model}")
                    return content
            except Exception as exc:
                logger.warning(f"KB updater model {model} failed: {exc}")
                continue
        return ""

    def _model_candidates(self, primary: str) -> list[str]:
        """Yield primary model first, then any other non-embed models from
        LM Studio as fallbacks. Used to retry når primary giver tom respons."""
        candidates = [primary]
        if self.provider != "lm_studio":
            return candidates
        try:
            client = self._client()
            for m in client.models.list().data:
                name = getattr(m, "id", "")
                if not name or name in candidates:
                    continue
                if "embed" in name.lower():
                    continue
                candidates.append(name)
        except Exception:
            pass
        return candidates


# ---- Persistence -----------------------------------------------------------


def load_knowledge_base() -> list[dict]:
    """Indlæs eksisterende vidensbase. Returnerer [] ved fejl/manglende fil."""
    if not KNOWLEDGE_BASE_PATH.exists():
        KNOWLEDGE_BASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        return []
    try:
        with KNOWLEDGE_BASE_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(f"Failed to load knowledge base: {exc}")
        return []


def save_knowledge_base(items: list[dict]) -> None:
    """Atomisk skriv af vidensbasen — temp-fil + rename så vi aldrig skriver
    en halv fil hvis processen dør midt i."""
    KNOWLEDGE_BASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = KNOWLEDGE_BASE_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)
    tmp.replace(KNOWLEDGE_BASE_PATH)
    logger.info(f"Saved {len(items)} items to knowledge base")


def _next_id(items: list[dict]) -> int:
    """Find næste ledige id ved at tage max+1. Robust hvis ID'er ikke er
    sekventielle (fx hvis én er slettet)."""
    if not items:
        return 1
    return max(int(i.get("id", 0)) for i in items) + 1


# ---- LLM-baseret term-syntese ----------------------------------------------


def _extract_json_object(text: str) -> Optional[dict]:
    """Pull et JSON-objekt ud af LLM-output. Tolerere code fences + prosa."""
    if not text:
        return None
    cleaned = text.strip()
    # Strip markdown fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
    # Find outer braces
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None


_SYSTEM_PROMPT = """Du skriver entries til en kommunal AI-compliance-videnbase i Danmark.

Stil: præcis, kortfattet embedsmandsdansk. Juridisk korrekt. Ingen markedsføringssprog. Refleger 2025/2026-status hvor relevant.

OUTPUT-FORMAT (følg præcist — alle 4 sektioner skal være med):

DEFINITION:
[1-2 sætninger der definerer termen. Max 200 tegn.]

KONTEKST:
[1-3 sætninger om hvorfor termen er relevant for kommunal AI-compliance, og hvad sagsbehandleren skal vide. Max 400 tegn.]

KATEGORI:
[Vælg én: legal, compliance, ai, operations]

TAGS:
[3-5 korte tags, kommasepareret på én linje]"""


def _build_user_prompt(term: str) -> str:
    return f"Skriv entry for termen: \"{term}\""


# Heuristic icon map — fallback når LLM ikke har en explicit icon. Vi
# kategoriserer på category-niveau så vi ikke skal lade Gemma vælge mellem
# 38 ikoner (det fejler).
_ICON_BY_CATEGORY = {
    "legal": "FaGavel",
    "compliance": "FaShieldAlt",
    "ai": "FaBrain",
    "operations": "FaCog",
}


_SECTION_DEF = "DEFINITION:"
_SECTION_CTX = "KONTEKST:"
_SECTION_CAT = "KATEGORI:"
_SECTION_TAGS = "TAGS:"


def _parse_sectioned_output(text: str) -> Optional[dict]:
    """Parse DEFINITION/KONTEKST/KATEGORI/TAGS-formatet."""
    if not text or not text.strip():
        return None

    sections: dict[str, str] = {}
    current: Optional[str] = None
    buf: list[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            if current and buf:
                buf.append("")
            continue
        # Section header detection
        for marker, key in (
            (_SECTION_DEF, "definition"),
            (_SECTION_CTX, "context"),
            (_SECTION_CAT, "category"),
            (_SECTION_TAGS, "tags"),
        ):
            if stripped.upper().startswith(marker):
                if current and buf:
                    sections[current] = "\n".join(buf).strip()
                current = key
                rest = stripped[len(marker):].strip()
                buf = [rest] if rest else []
                break
        else:
            if current:
                buf.append(line)
    if current and buf:
        sections[current] = "\n".join(buf).strip()

    return sections or None


def _generate_entry_for_term(term: str, provider: _LLMProvider) -> Optional[dict]:
    """Returnér en fuldt formateret entry til vidensbasen, eller None."""
    try:
        raw = provider.chat(
            system=_SYSTEM_PROMPT,
            user=_build_user_prompt(term),
            max_tokens=600,
        )
    except Exception as exc:
        logger.warning(f"LLM-call failed for term '{term}': {exc}")
        return None

    sections = _parse_sectioned_output(raw)
    if not sections:
        logger.warning(f"Could not parse LLM output for term '{term}': {raw[:200]}")
        return None

    definition = (sections.get("definition") or "").strip()[:600]
    context = (sections.get("context") or "").strip()[:1200]
    category = (sections.get("category") or "").strip().lower()
    if category not in _CATEGORIES:
        # Try to find one of the valid categories anywhere in the field
        for valid in _CATEGORIES:
            if valid in category:
                category = valid
                break
        else:
            category = "compliance"

    raw_tags = (sections.get("tags") or "").strip()
    # Tags can be comma-separated or bullet-separated
    tags: list[str] = []
    for part in raw_tags.replace(";", ",").replace("•", ",").split(","):
        cleaned = part.strip().strip("[]\"'-")
        if cleaned and 1 < len(cleaned) <= 60:
            tags.append(cleaned)
    tags = tags[:6]

    if not definition:
        return None

    return {
        "term": term,
        "category": category,
        "iconKey": _ICON_BY_CATEGORY.get(category, _DEFAULT_ICON),
        "definition": definition,
        "context": context,
        "tags": tags,
        "references": [],  # LLM skal ikke lave kilder op — kommer manuelt senere
        "auto_generated": True,
        "added_at": datetime.now(UTC).isoformat(),
    }


# ---- Public API ------------------------------------------------------------


async def update_knowledge_base(
    recent_queries: Optional[list[str]] = None,
    *,
    max_new_terms: int = 5,
) -> dict[str, Any]:
    """Opdater vidensbasen med op til ``max_new_terms`` nye termer.

    Hvis ``recent_queries`` er givet, ekstraheres kandidater derfra (ellers
    bruges default-seed-listen). Termer der allerede findes (case-insensitive
    match på 'term'-feltet) springes over.
    """
    logger.info("Starting knowledge-base update (weekly)")

    items = load_knowledge_base()
    existing_terms = {(i.get("term") or "").lower() for i in items}

    # Pick candidate terms
    if recent_queries:
        candidates = await asyncio.to_thread(
            _extract_terms_from_queries, recent_queries
        )
    else:
        candidates = list(_DEFAULT_SEED_TERMS)

    new_candidates = [
        t for t in candidates if t and t.lower() not in existing_terms
    ][:max_new_terms]

    if not new_candidates:
        logger.info("No new terms to add to knowledge base")
        return {
            "success": True,
            "new_terms_count": 0,
            "total_terms_count": len(items),
            "candidates_evaluated": len(candidates),
            "provider": "none",
            "message": "Ingen nye termer at tilføje.",
        }

    provider = _LLMProvider()
    if not provider.is_configured():
        logger.warning("No LLM provider configured — skipping update")
        return {
            "success": False,
            "new_terms_count": 0,
            "total_terms_count": len(items),
            "candidates_evaluated": len(candidates),
            "provider": "none",
            "message": "Ingen LLM-provider konfigureret. Sæt LM_STUDIO_BASE_URL eller AZURE_OPENAI_API_KEY i .env.",
        }

    # Run the LLM calls in a thread pool — provider.chat is sync
    new_entries: list[dict] = []
    for term in new_candidates:
        entry = await asyncio.to_thread(_generate_entry_for_term, term, provider)
        if entry is None:
            continue
        # Assign next id at write-time so concurrent updates don't collide
        entry["id"] = _next_id(items + new_entries)
        new_entries.append(entry)
        logger.info(f"Generated KB entry for '{term}' via {provider.label()}")

    if new_entries:
        items.extend(new_entries)
        await asyncio.to_thread(save_knowledge_base, items)

    return {
        "success": True,
        "new_terms_count": len(new_entries),
        "total_terms_count": len(items),
        "candidates_evaluated": len(candidates),
        "candidates_attempted": len(new_candidates),
        "provider": provider.label(),
        "added_terms": [e["term"] for e in new_entries],
        "message": (
            f"Tilføjet {len(new_entries)} nye termer."
            if new_entries
            else "Ingen termer kunne genereres — LLM gav ikke gyldigt output."
        ),
    }


def _extract_terms_from_queries(queries: list[str]) -> list[str]:
    """Simpel keyword-ekstraktion fra recent_queries.

    Bevidst regex-baseret (ingen LLM-kald) fordi vi har en pre-curated
    seed-liste i forvejen. LLM bruges kun til at definere allerede-valgte
    termer, ikke til at vælge dem.
    """
    import re

    if not queries:
        return []

    # Candidate phrases: two-or-more capitalized words, or known acronyms,
    # or anything in quotes
    candidates: list[str] = []
    for q in queries[:50]:
        # Capitalised multi-word phrases
        for m in re.finditer(r"\b[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+){1,3}\b", q):
            candidates.append(m.group(0))
        # 2-5 letter acronyms
        for m in re.finditer(r"\b[A-Z]{2,5}\b", q):
            candidates.append(m.group(0))
        # Quoted phrases
        for m in re.finditer(r'"([^"]{4,80})"', q):
            candidates.append(m.group(1))

    # Dedupe preserving order
    seen: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.append(c)
    return seen[:30]


def run_knowledge_base_update(
    recent_queries: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Synkron wrapper — bekvem til scheduler-kald."""
    return asyncio.run(update_knowledge_base(recent_queries))


__all__ = [
    "update_knowledge_base",
    "run_knowledge_base_update",
    "load_knowledge_base",
    "save_knowledge_base",
]
