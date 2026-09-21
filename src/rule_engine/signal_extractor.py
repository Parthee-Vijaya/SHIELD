"""LLM-assisted extraction of trigger signals from a free-text system description.

The signal extractor is the ONLY place an LLM participates in the rule
evaluation pipeline. Its scope is intentionally narrow:

  free text + a list of expected signal names  →  {signal_name: True | False | "usikker"}

It cannot change the rule's outcome, can't introduce new signals, and
its output is mechanically validated against the rule's schema before
being passed to the deterministic executor.

Usage:

    extractor = SignalExtractor()
    signals = extractor.extract(
        "Borgerassistenten er en chatbot der hjælper med pension...",
        rules,
    )
    # signals: {"system.processes_personal_data": True, ...}

Deterministic test mode:

    extractor = SignalExtractor(llm=StubLLM({"system.processes_personal_data": True}))

"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Iterable, Protocol

from src.rule_engine.models import Rule, TriggerCondition

logger = logging.getLogger(__name__)


SignalValue = bool | str  # bool for True/False, "usikker" for unknown
_AUTO_LLM = object()


class LLMClient(Protocol):
    """Minimal protocol — anything with a `.invoke(prompt) -> str` works.

    Both `langchain_openai.ChatOpenAI` and `AzureChatOpenAI` satisfy this
    via their `.invoke` method (returns AIMessage with `.content`).
    A test stub can implement it in a few lines.
    """

    def invoke(self, prompt: str) -> object: ...


class SignalExtractionError(Exception):
    pass


def _default_llm() -> LLMClient | None:
    """Build an LLM client from environment variables.

    Selection priority (first match wins):
      1. LM_STUDIO_BASE_URL  — local LM Studio / any OpenAI-compatible
         endpoint (Ollama, vLLM, llama.cpp server, …). API key is
         typically not required but can be set via LM_STUDIO_API_KEY.
      2. AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY — Azure OpenAI.
      3. OPENAI_API_KEY — public OpenAI API.

    Returns `None` if nothing is configured. Callers handle that path
    by skipping LLM extraction and relying on caller-provided signals.
    """
    try:
        from langchain_openai import AzureChatOpenAI, ChatOpenAI
    except ImportError:
        logger.warning("langchain_openai not installed; signal extraction disabled")
        return None

    # 1. Local OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, …)
    lmstudio_url = os.getenv("LM_STUDIO_BASE_URL")
    if lmstudio_url:
        client = ChatOpenAI(
            base_url=lmstudio_url,
            api_key=os.getenv("LM_STUDIO_API_KEY", "lm-studio"),
            model=os.getenv("LM_STUDIO_MODEL", "local-model"),
            temperature=0.0,
            timeout=int(os.getenv("LM_STUDIO_TIMEOUT", "60")),
        )
        # Small local models often wrap JSON in prose or emit JSON-like syntax.
        # OpenAI-compatible servers such as Ollama can enforce a JSON object at
        # the protocol level. Keep this opt-in because older LM Studio versions
        # may not implement response_format.
        if os.getenv("LM_STUDIO_JSON_MODE", "").strip().lower() in {
            "1", "true", "yes", "on",
        }:
            return client.bind(response_format={"type": "json_object"})
        return client

    # 2. Azure OpenAI
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if azure_endpoint and azure_api_key:
        return AzureChatOpenAI(
            azure_endpoint=azure_endpoint,
            api_key=azure_api_key,
            api_version=os.getenv("OPENAI_API_VERSION", "2024-02-15-preview"),
            deployment_name=os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o-mini"),
            temperature=0.0,
            timeout=15,
        )

    # 3. Public OpenAI
    if os.getenv("OPENAI_API_KEY"):
        return ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.0,
            timeout=15,
        )

    return None


def _signals_for_rule(rule: Rule) -> list[str]:
    conditions: Iterable[TriggerCondition] = []
    if rule.trigger.any_of:
        conditions = list(rule.trigger.any_of)
    elif rule.trigger.all_of:
        conditions = list(rule.trigger.all_of)
    return [c.signal for c in conditions]


def _normalize_value(raw: object) -> SignalValue | None:
    """Coerce LLM output into a `SignalValue`. Returns `None` for
    anything we don't recognize (caller treats that as 'usikker')."""
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        s = raw.strip().lower()
        if s in ("true", "ja", "yes", "1"):
            return True
        if s in ("false", "nej", "no", "0"):
            return False
        if s in ("usikker", "unknown", "uncertain", "maybe"):
            return "usikker"
    return None


_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_llm_json(content: str, expected_signals: set[str]) -> dict[str, SignalValue]:
    """Pull the first JSON object out of the LLM response and pick out
    only signals that the rule actually expects. Anything else is
    silently dropped — we never widen the signal set from LLM output."""
    match = _JSON_BLOCK_RE.search(content)
    if not match:
        raise SignalExtractionError(f"LLM response contained no JSON object: {content[:200]!r}")
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise SignalExtractionError(f"LLM response is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise SignalExtractionError(f"LLM JSON is not an object: {type(data).__name__}")

    out: dict[str, SignalValue] = {}
    for name in expected_signals:
        raw = data.get(name)
        if name not in data:
            # Some JSON-mode models interpret dotted signal identifiers as
            # object paths: {"system": {"uses_ai": true}}. Resolve only the
            # exact expected path, so nested output cannot widen the signal set.
            raw = data
            for segment in name.split("."):
                if not isinstance(raw, dict) or segment not in raw:
                    raw = None
                    break
                raw = raw[segment]
        normalized = _normalize_value(raw)
        if normalized is None:
            continue
        out[name] = normalized
    return out


class SignalExtractor:
    def __init__(self, llm: LLMClient | None | object = _AUTO_LLM):
        # Omitting the argument enables environment-based discovery, while an
        # explicit ``None`` remains the deterministic, LLM-disabled mode used
        # by tests and by callers that must fail closed.
        self._llm = _default_llm() if llm is _AUTO_LLM else llm

    @property
    def is_configured(self) -> bool:
        return self._llm is not None

    def extract_for_rule(
        self, system_description: str, rule: Rule
    ) -> dict[str, SignalValue]:
        """Ask the LLM to interpret signals defined on a single rule.

        Returns an empty dict if the rule has no `llm_fortolkning` block,
        or if no LLM is configured. Skips signals the LLM marks 'usikker'.
        """
        if rule.llm_fortolkning is None or self._llm is None:
            return {}

        expected = set(_signals_for_rule(rule))
        if not expected:
            return {}

        # Don't use str.format here — prompt templates often contain JSON
        # examples like `{"system.x": true}` which would crash .format().
        signal_list = "\n".join(f"- {s}" for s in sorted(expected))
        prompt = (
            rule.llm_fortolkning.prompt_template
            .replace("{system_beskrivelse}", system_description)
            .replace("{signal_liste}", signal_list)
        )

        try:
            response = self._llm.invoke(prompt)
        except Exception as exc:
            raise SignalExtractionError(
                f"LLM invocation failed for rule '{rule.id}': {exc}"
            ) from exc

        content = getattr(response, "content", response)
        if not isinstance(content, str):
            content = str(content)

        parsed = _parse_llm_json(content, expected)
        # 'usikker' values are not propagated to the executor — the
        # caller can either treat them as False (default) or fall back
        # to an explicit predicate question.
        return {k: v for k, v in parsed.items() if isinstance(v, bool)}

    def extract(
        self, system_description: str, rules: list[Rule]
    ) -> dict[str, SignalValue]:
        """Extract signals across multiple rules. Later rules override
        earlier ones if they happen to share a signal name."""
        merged: dict[str, SignalValue] = {}
        for rule in rules:
            merged.update(self.extract_for_rule(system_description, rule))
        return merged

    def extract_predicates_for_rule(
        self, system_description: str, rule: Rule
    ) -> dict[str, object]:
        """Best-effort extraction of predicate values from free text.

        Used by the document-analyzer when it has detected a rule's
        trigger fired and wants to fill in predicates instead of
        leaving them as MANGLER INPUT. Output is mechanically
        validated against the predicate's type and enum_values
        before being returned — anything the LLM emits that doesn't
        match the schema is silently dropped.

        Returns a dict where keys are predicate ids and values are
        either bool (for type=boolean) or str (for type=enum). The
        caller passes these to RuleInput(predicates=...).
        """
        if self._llm is None or not rule.predikater:
            return {}

        # Build a structured prompt that lists each predicate with its
        # question, type, and (for enums) the legal values.
        items: list[str] = []
        for p in rule.predikater:
            if p.type.value == "enum":
                vals = ", ".join(p.enum_values or [])
                items.append(
                    f"- {p.id} (enum, vælg én: {vals}): {p.spørgsmål}"
                )
            elif p.type.value == "boolean":
                items.append(
                    f"- {p.id} (true/false): {p.spørgsmål}"
                )
            else:
                # text/number predicates — skip; not extractable safely
                continue

        if not items:
            return {}

        predicate_list = "\n".join(items)
        prompt = (
            "Du er et juridisk-teknisk værktøj. Læs nedenstående system-/dokumenttekst "
            "og besvar de listede predikater så præcist som muligt baseret på indholdet.\n\n"
            "Returnér KUN et JSON-objekt på formen {\"predikat_id\": \"værdi\"}.\n"
            "- For boolean: brug true / false / \"usikker\"\n"
            "- For enum: brug én af de tilladte værdier eller \"usikker\"\n"
            "- Spring predikater over hvis dokumentet ikke giver klart grundlag\n\n"
            f"PREDIKATER:\n{predicate_list}\n\n"
            f"TEKST:\n{system_description[:8000]}\n\n"
            "JSON:"
        )

        try:
            response = self._llm.invoke(prompt)
        except Exception as exc:
            raise SignalExtractionError(
                f"LLM predicate extraction failed for rule '{rule.id}': {exc}"
            ) from exc

        content = getattr(response, "content", response)
        if not isinstance(content, str):
            content = str(content)

        # Reuse the JSON-parsing utility but build expected_keys from
        # predicate ids and validate types.
        match = _JSON_BLOCK_RE.search(content)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}
        if not isinstance(data, dict):
            return {}

        out: dict[str, object] = {}
        predicates_by_id = {p.id: p for p in rule.predikater}
        for key, raw_value in data.items():
            pred = predicates_by_id.get(key)
            if pred is None:
                continue
            # Skip "usikker" — caller should keep predicate unanswered
            if isinstance(raw_value, str) and raw_value.strip().lower() in (
                "usikker", "unknown", "uncertain", "maybe"
            ):
                continue
            if pred.type.value == "boolean":
                normalized = _normalize_value(raw_value)
                if isinstance(normalized, bool):
                    out[key] = normalized
            elif pred.type.value == "enum":
                if isinstance(raw_value, str) and pred.enum_values:
                    val = raw_value.strip()
                    if val in pred.enum_values:
                        out[key] = val
        return out
