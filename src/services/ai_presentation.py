"""Model-focused presentation without changing stored execution provenance.

Only known platform metadata is rewritten. Source text, quotations and assessment
content must never pass through these helpers.
"""

from __future__ import annotations

import re
from typing import Any


MODEL_LABELS = {
    "gpt-5.5": "GPT-5.5",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-6-astra": "GPT-6 Astra",
}
IMPORT_NOTE = "Modeloplysningen er registreret ved import af udkastet."
USAGE_NOTE = "Modellens tokenforbrug er ikke tilgængeligt i denne import."


def model_label(value: Any) -> str:
    if not isinstance(value, str) or not value:
        return "Ikke registreret"
    identifier = value.removeprefix("openai/")
    return MODEL_LABELS.get(identifier, value)


def metadata_identifier(value: Any) -> str | None:
    """Hide platform-specific IDs in display payloads; keep originals in storage."""
    return value if isinstance(value, str) and "codex" not in value.lower() else None


def metadata_note(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    draft_note = re.fullmatch(
        r"(?:Testudkast|Udkast) udarbejdet i Codex med ([^;]+); JEV-kontrol via AI Gateway\.",
        value,
    )
    if draft_note:
        return f"Udkast udarbejdet med {model_label(draft_note.group(1))}; kvalitetstjek ved JEV."
    if value in {
        "Model og kørsels-ID er angivet af den lokale Codex-operatør; importen starter ikke Codex.",
        "Model og kørsels-ID er angivet af den lokale operatør; denne import starter ikke Codex.",
        "Model og testkørsels-ID er angivet af den lokale testoperatør; denne import starter ikke Codex.",
    }:
        return IMPORT_NOTE
    if value == "Codex-forbrug er ikke tilgængeligt i denne import.":
        return USAGE_NOTE
    return value


def limitation_notes(value: Any) -> list[str]:
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list):
        return []
    return [note for item in values if (note := metadata_note(item)) is not None]
