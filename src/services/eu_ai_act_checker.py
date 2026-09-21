"""Sync af EU AI Act Compliance Checker — den officielle EC-tjeneste.

EC's Compliance Checker (https://ai-act-service-desk.ec.europa.eu/en/eu-ai-act-compliance-checker)
er den autoritative måde at klassificere et AI-system mod AI Act. Den
består af 33 spørgsmål + 45 outcome-flags og henter sin logik fra to
public JSON-filer på europa.eu:

  logic.json      — questions_logic + flags_logic + last_update_date
  content_en.json — questions_content + flags_content (på engelsk)

Vi cacher begge filer lokalt så Tyr's wizard fungerer offline + så vi
selv kan markere "stale" hvis EC's version-stempel rykker uventet.

Cron: ugentligt mandag 04:30 (efter citation-verifier 04:00).
Manuel trigger: POST /api/eu-ai-act-checker/refresh
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# EC's CDN-URLs for compliance checker assets. Hentet via Network-tab på
# https://ai-act-service-desk.ec.europa.eu/en/eu-ai-act-compliance-checker
_LOGIC_URL = "https://europa.eu/assets/wcloud/widgets/202506/211c3a80-559a-11f0-b4dd-7fbfa4c84d38/logic.json"
_CONTENT_URL_TEMPLATE = (
    "https://europa.eu/assets/wcloud/widgets/202506/211c3a80-559a-11f0-b4dd-7fbfa4c84d38/content_{lang}.json"
)

# Per maj 2026 leverer EC engelsk + 5 sprog. Vi henter EN som primær —
# Tyr har dansk UI men juridiske AI Act-citater er authoritative på engelsk.
SUPPORTED_LANGS = ("en", "da", "de", "fr", "it", "pl", "es")
PRIMARY_LANG = "en"

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "eu_ai_act_checker"
LOGIC_PATH = CACHE_DIR / "logic.json"
CONTENT_PATH_TEMPLATE = "content_{lang}.json"
META_PATH = CACHE_DIR / "_meta.json"

_REQUEST_TIMEOUT = 30.0
_USER_AGENT = "SHIELD/1.0 ec-checker-sync (Kalundborg Kommune)"


# ---- Cache I/O -------------------------------------------------------------


def _atomic_write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        if isinstance(payload, (dict, list)):
            json.dump(payload, fh, ensure_ascii=False)
        else:
            fh.write(payload)
    tmp.replace(path)


def _safe_read_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return None


def _read_meta() -> dict:
    return _safe_read_json(META_PATH) or {}


def _write_meta(meta: dict) -> None:
    _atomic_write(META_PATH, meta)


# ---- Public API ------------------------------------------------------------


def load_checker_payload(lang: str = "en") -> dict:
    """Returnér samlet payload {logic, content, meta} fra cache."""
    if lang not in SUPPORTED_LANGS:
        lang = PRIMARY_LANG
    logic = _safe_read_json(LOGIC_PATH)
    content_path = CACHE_DIR / CONTENT_PATH_TEMPLATE.format(lang=lang)
    content = _safe_read_json(content_path)

    # Fallback: hvis ønsket sprog ikke er tilgængelig, brug primary
    fallback_lang = None
    if content is None and lang != PRIMARY_LANG:
        primary_path = CACHE_DIR / CONTENT_PATH_TEMPLATE.format(lang=PRIMARY_LANG)
        content = _safe_read_json(primary_path)
        fallback_lang = PRIMARY_LANG

    meta = _read_meta()
    return {
        "logic": logic or {},
        "content": content or {},
        "lang": fallback_lang or lang,
        "requested_lang": lang,
        "meta": meta,
        "ready": logic is not None and content is not None,
    }


async def refresh_checker(langs: tuple[str, ...] = ("en",)) -> dict:
    """Hent fresh logic.json + content_en.json (+ valgfrie ekstra sprog).

    Returnerer summary med før/efter version-stempler. Hvis EC's
    last_update_date er ændret siden sidst, markerer vi det i metaen så
    UI kan vise et "Ny version" hint.
    """
    summary: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "fetched": [],
        "errors": [],
        "previous_update_date": (_read_meta() or {}).get("last_update_date"),
    }

    headers = {"User-Agent": _USER_AGENT, "Accept": "application/json"}

    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=_REQUEST_TIMEOUT) as client:
        # Logic er sprog-uafhængig — hent den én gang
        try:
            r = await client.get(_LOGIC_URL)
            r.raise_for_status()
            logic_payload = r.json()
            await asyncio.to_thread(_atomic_write, LOGIC_PATH, logic_payload)
            summary["fetched"].append({"file": "logic.json", "bytes": len(r.content)})
            new_update = logic_payload.get("last_update_date")
        except Exception as exc:
            logger.exception("logic.json fetch failed")
            summary["errors"].append({"file": "logic.json", "error": str(exc)[:200]})
            return summary

        # Hent indholdet på alle ønskede sprog
        for lang in langs:
            url = _CONTENT_URL_TEMPLATE.format(lang=lang)
            try:
                r = await client.get(url)
                if r.status_code == 404:
                    summary["errors"].append({"file": f"content_{lang}.json", "error": "404 (sprog ikke tilgængeligt)"})
                    continue
                r.raise_for_status()
                content_payload = r.json()
                await asyncio.to_thread(
                    _atomic_write,
                    CACHE_DIR / CONTENT_PATH_TEMPLATE.format(lang=lang),
                    content_payload,
                )
                summary["fetched"].append({"file": f"content_{lang}.json", "bytes": len(r.content)})
            except Exception as exc:
                logger.warning(f"content_{lang}.json fetch failed: {exc}")
                summary["errors"].append({"file": f"content_{lang}.json", "error": str(exc)[:200]})

    # Opdater meta
    new_meta = {
        "last_update_date": new_update,
        "fetched_at": datetime.now(UTC).isoformat(),
        "previous_update_date": summary["previous_update_date"],
        "version_changed": (
            summary["previous_update_date"] is not None
            and summary["previous_update_date"] != new_update
        ),
        "langs_cached": [
            entry["file"].replace("content_", "").replace(".json", "")
            for entry in summary["fetched"]
            if entry["file"].startswith("content_")
        ],
        "n_questions": len(logic_payload.get("questions_logic", {})),
        "n_flags": len(logic_payload.get("flags_logic", {})),
    }
    await asyncio.to_thread(_write_meta, new_meta)

    summary["new_update_date"] = new_update
    summary["version_changed"] = new_meta["version_changed"]
    summary["finished_at"] = datetime.now(UTC).isoformat()
    return summary


async def scheduled_eu_checker_sync() -> None:
    """APScheduler entry point."""
    try:
        await refresh_checker(langs=("en",))
    except Exception:
        logger.exception("scheduled EU AI Act checker sync failed")
