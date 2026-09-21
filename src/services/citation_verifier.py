"""Citation-verifier — verificerer at hver YAML-regels lov-citat stadig findes
ordret i kilden (EUR-Lex, Retsinformation osv.).

Dette giver kommunale jurister noget ailex.dk ikke kan: bevisbart at vores
citater er friske ift. den faktiske lovtekst — fitness-funktion der matcher
kommunal grundighed.

Køres dagligt via APScheduler. Per regel:
  1. Hent kilde.url (cached 24h via httpx)
  2. Normalisér whitespace (citater fra YAML kan være formatteret anderledes
     end siden de stammer fra)
  3. Søg efter kilde.citat som substring
  4. Hvis fundet: opdater sidst_verificeret = i dag
  5. Hvis ikke fundet: marker regel som flagget_juridisk_review = true
     og log advarsel i RuleFreshness-tabellen.

Resultaterne persisteres så frontend kan vise grøn/rød/grå status.
"""

from __future__ import annotations

import logging
import hashlib
import os
import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, UTC
from typing import Optional

import httpx
from sqlalchemy import Column, DateTime, String, Text, Boolean, Integer
from sqlalchemy.orm import Session

from src.database.connection import Base
from src.rule_engine.models import Rule

logger = logging.getLogger(__name__)


# ---- Database model for verification results --------------------------------

class RuleFreshness(Base):
    """Latest verification status per rule_id. Updated daily."""

    __tablename__ = "rule_freshness"

    rule_id = Column(String(128), primary_key=True)
    last_checked_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
    )
    citation_found = Column(Boolean, nullable=False, default=False)
    flagged_for_review = Column(Boolean, nullable=False, default=False)
    http_status = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    source_url = Column(Text, nullable=True)
    snippet = Column(Text, nullable=True)  # short context where citat was found
    # Which verification method produced the latest result — "requests" for
    # static HTML, "playwright" for SPA-rendered pages. Helps operators see
    # which rules need the slower path.
    verification_method = Column(String(16), nullable=True)

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "last_checked_at": self.last_checked_at.isoformat() if self.last_checked_at else None,
            "citation_found": self.citation_found,
            "flagged_for_review": self.flagged_for_review,
            "http_status": self.http_status,
            "error_message": self.error_message,
            "source_url": self.source_url,
            "snippet": self.snippet,
            "verification_method": self.verification_method,
        }


# ---- Verification logic -----------------------------------------------------

@dataclass
class VerificationResult:
    rule_id: str
    citation_found: bool
    flagged_for_review: bool
    http_status: Optional[int]
    error_message: Optional[str]
    source_url: Optional[str]
    snippet: Optional[str]
    method: str = "requests"  # "requests" or "playwright"
    content_sha256: Optional[str] = None


_HTML_TAG = re.compile(r"<[^>]+>")
_WHITESPACE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    """Strip HTML, normalize Unicode forms (NFKD), collapse whitespace,
    lowercase. Compares text robustly across HTML formatting and unicode
    quote/dash variants."""
    if not text:
        return ""
    text = _HTML_TAG.sub(" ", text)
    text = unicodedata.normalize("NFKD", text)
    # Replace common unicode variants with ASCII equivalents
    text = text.replace(" ", " ")  # non-breaking space
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("–", "-").replace("—", "-").replace("−", "-")
    text = text.replace("»", '"').replace("«", '"')
    text = _WHITESPACE.sub(" ", text)
    return text.strip().lower()


def _shortest_signature(citat: str, n: int = 100) -> str:
    """Return first N significant chars of citat — used for fuzzy fallback
    when full substring match fails (e.g. site reformatted listing)."""
    sig = _normalize(citat)
    return sig[:n] if len(sig) >= n else sig


def verify_rule(rule: Rule, *, timeout: float = 15.0) -> VerificationResult:
    """Fetch the rule's source URL and verify the citat appears in it."""
    raw_url = getattr(rule.kilde, "url", None) if rule.kilde else None
    # rule.kilde.url is a Pydantic AnyUrl — coerce to plain string for
    # httpx and SQLAlchemy storage.
    url = str(raw_url) if raw_url else None
    citat = getattr(rule.kilde, "citat", "") if rule.kilde else ""
    rule_id = rule.id

    if not url:
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message="No source URL on this rule",
            source_url=None,
            snippet=None,
        )
    if not citat:
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message="No citat on this rule",
            source_url=url,
            snippet=None,
        )

    try:
        with httpx.Client(follow_redirects=True, timeout=timeout) as client:
            r = client.get(url, headers={"User-Agent": "SHIELD/1.0 citation-verifier"})
        status = r.status_code
        if status >= 400:
            return VerificationResult(
                rule_id=rule_id,
                citation_found=False,
                flagged_for_review=True,
                http_status=status,
                error_message=f"HTTP {status} from source",
                source_url=url,
                snippet=None,
            )
        body_normalized = _normalize(r.text)
        citat_normalized = _normalize(citat)
        found = citat_normalized in body_normalized
        snippet: Optional[str] = None
        if found:
            idx = body_normalized.find(citat_normalized)
            window_start = max(0, idx - 50)
            window_end = min(len(body_normalized), idx + len(citat_normalized) + 50)
            snippet = body_normalized[window_start:window_end]
        else:
            # A prefix match is useful context for a jurist, but it is never
            # strong enough to count as a verified legal citation.
            sig = _shortest_signature(citat, 100)
            if sig and sig in body_normalized:
                snippet = "Delvis match — første 100 tegn fundet, men ikke hele citatet"

        return VerificationResult(
            rule_id=rule_id,
            citation_found=found,
            flagged_for_review=not found,
            http_status=status,
            error_message=(
                None if found else
                "Kun et delvist match blev fundet; fuldt juridisk review er påkrævet"
                if snippet else
                "Citat ikke fundet i kildens HTML"
            ),
            source_url=url,
            snippet=snippet,
            content_sha256=hashlib.sha256(body_normalized.encode("utf-8")).hexdigest(),
        )
    except httpx.RequestError as exc:
        logger.warning("citation-verify network error for %s: %s", rule_id, exc)
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message=f"Network error: {exc}",
            source_url=url,
            snippet=None,
        )
    except Exception as exc:
        logger.exception("citation-verify failed for %s", rule_id)
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message=f"Unexpected error: {exc}",
            source_url=url,
            snippet=None,
        )


def persist_result(session: Session, result: VerificationResult) -> RuleFreshness:
    existing = (
        session.query(RuleFreshness)
        .filter(RuleFreshness.rule_id == result.rule_id)
        .one_or_none()
    )
    if existing is None:
        existing = RuleFreshness(rule_id=result.rule_id)
        session.add(existing)
    existing.last_checked_at = datetime.now(UTC)
    existing.citation_found = result.citation_found
    existing.flagged_for_review = result.flagged_for_review
    existing.http_status = result.http_status
    existing.error_message = result.error_message
    existing.source_url = result.source_url
    existing.snippet = result.snippet[:500] if result.snippet else None
    existing.verification_method = result.method
    session.flush()
    return existing


def _register_legal_source_observation(
    session: Session,
    rule: Rule,
    result: VerificationResult,
) -> None:
    """Feed successful source observations into the case-impact register.

    Network failures and inaccessible pages are freshness warnings, not proof
    of a legal amendment.  Only a retrieved source body has a checksum that can
    safely become a version observation.
    """

    if not result.source_url or not result.content_sha256:
        return
    from src.services.law_change_impact import register_legal_source_version

    host = result.source_url.lower()
    authority = (
        "EUR-Lex"
        if "eur-lex.europa.eu" in host
        else "Retsinformation"
        if "retsinformation.dk" in host
        else "Officiel retskilde"
    )
    register_legal_source_version(
        session,
        source_key=f"rule:{rule.id}",
        title=f"{rule.kilde.lov} · {rule.kilde.artikel}",
        authority=authority,
        source_url=result.source_url,
        content_sha256=result.content_sha256,
        version_identifier=result.content_sha256[:12],
        jurisdiction="EU" if authority == "EUR-Lex" else "DK",
        change_summary=(
            f"Automatisk kildekontrol registrerede ændret indhold for {rule.kilde.artikel}."
        ),
        metadata={
            "rule_id": rule.id,
            "citation_found": result.citation_found,
            "verification_method": result.method,
        },
    )


# ---- Playwright fallback ---------------------------------------------------

# URL fragments that signal the page is server-rendered HTML where requests
# cannot find the citat. These rules will skip directly to Playwright.
_KNOWN_SPA_HOSTS = (
    "eur-lex.europa.eu",
    "data.europa.eu",
)


def _looks_like_spa(url: str) -> bool:
    return any(host in url for host in _KNOWN_SPA_HOSTS)


def is_playwright_available() -> bool:
    """Check if Playwright + a Chromium browser binary are installed.

    Cheap — does not actually launch a browser. Returns False if either the
    Python package or the browser binary is missing.
    """
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        return False

    try:
        from playwright.sync_api import sync_playwright

        # Trying to find the executable is the cheapest way to confirm the
        # browser is installed without launching it.
        with sync_playwright() as p:
            path = p.chromium.executable_path
            return bool(path) and os.path.exists(path)
    except Exception:
        return False


def verify_rule_with_playwright(
    rule: Rule, *, timeout_ms: int = 30_000
) -> VerificationResult:
    """Verify a rule's citat by rendering the source URL with headless Chromium.

    Used as a fallback for SPA-rendered pages (EUR-Lex etc.) where the static
    HTML response from `requests` does not contain the citat text — the page
    fetches it client-side.

    Cost ~3-8s per page (Chromium boot + network + render).
    """
    raw_url = getattr(rule.kilde, "url", None) if rule.kilde else None
    url = str(raw_url) if raw_url else None
    citat = getattr(rule.kilde, "citat", "") if rule.kilde else ""
    rule_id = rule.id

    if not url or not citat:
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message="No source URL or citat",
            source_url=url,
            snippet=None,
            method="playwright",
        )

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message="Playwright not installed",
            source_url=url,
            snippet=None,
            method="playwright",
        )

    citat_normalized = _normalize(citat)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    user_agent="SHIELD/1.0 citation-verifier (Playwright)",
                )
                page = context.new_page()
                response = page.goto(url, wait_until="networkidle", timeout=timeout_ms)
                http_status = response.status if response else None
                # Wait for body text to settle. Some EUR-Lex variants hydrate
                # content into an article element after first paint.
                try:
                    page.wait_for_load_state("networkidle", timeout=5_000)
                except Exception:
                    pass
                rendered_text = page.evaluate(
                    "() => document.body ? document.body.innerText : ''"
                )
            finally:
                browser.close()
    except Exception as exc:
        logger.exception("Playwright verification failed for %s", rule_id)
        return VerificationResult(
            rule_id=rule_id,
            citation_found=False,
            flagged_for_review=True,
            http_status=None,
            error_message=f"Playwright error: {exc}",
            source_url=url,
            snippet=None,
            method="playwright",
        )

    body_normalized = _normalize(rendered_text or "")
    found = citat_normalized in body_normalized
    snippet: Optional[str] = None
    if found:
        idx = body_normalized.find(citat_normalized)
        window_start = max(0, idx - 50)
        window_end = min(len(body_normalized), idx + len(citat_normalized) + 50)
        snippet = body_normalized[window_start:window_end]
    else:
        sig = _shortest_signature(citat, 100)
        if sig and sig in body_normalized:
            snippet = "Delvis match — første 100 tegn fundet (Playwright-render)"

    return VerificationResult(
        rule_id=rule_id,
        citation_found=found,
        flagged_for_review=not found,
        http_status=http_status,
        error_message=(
            None if found else
            "Kun et delvist match blev fundet; fuldt juridisk review er påkrævet"
            if snippet else
            "Citat ikke fundet i Playwright-rendered HTML"
        ),
        source_url=url,
        snippet=snippet,
        method="playwright",
        content_sha256=hashlib.sha256(body_normalized.encode("utf-8")).hexdigest(),
    )


def verify_all_rules(
    session: Session,
    rules: list[Rule],
    *,
    enable_playwright_fallback: bool = True,
) -> list[RuleFreshness]:
    """Verify every rule and persist the result. Idempotent — running
    twice in a row produces the same final state.

    Two-pass strategy:
      1. Fast `requests` for everything.
      2. For rules that fail the requests check AND look SPA-rendered,
         retry with Playwright. Skip pass 2 if Playwright isn't installed.
    """
    results_by_id: dict[str, VerificationResult] = {}
    for rule in rules:
        url = str(rule.kilde.url) if rule.kilde and rule.kilde.url else ""
        # Skip directly to Playwright for known SPA hosts to save one round trip
        if enable_playwright_fallback and _looks_like_spa(url) and is_playwright_available():
            results_by_id[rule.id] = verify_rule_with_playwright(rule)
        else:
            results_by_id[rule.id] = verify_rule(rule)

    if enable_playwright_fallback and is_playwright_available():
        for rule in rules:
            current = results_by_id.get(rule.id)
            if current and current.citation_found:
                continue
            if current and current.method == "playwright":
                continue  # already tried Playwright — no point retrying
            logger.info("Retrying rule %s with Playwright after requests miss", rule.id)
            playwright_result = verify_rule_with_playwright(rule)
            if playwright_result.citation_found or current is None:
                results_by_id[rule.id] = playwright_result

    persisted: list[RuleFreshness] = []
    for rule in rules:
        result = results_by_id.get(rule.id)
        if result is None:
            continue
        persisted.append(persist_result(session, result))
        try:
            _register_legal_source_observation(session, rule, result)
        except Exception:
            logger.exception(
                "Could not update legal-change impact register for %s",
                rule.id,
            )
    return persisted


def list_freshness(session: Session) -> list[RuleFreshness]:
    return session.query(RuleFreshness).order_by(RuleFreshness.rule_id).all()


def flagged_rule_ids(session: Session) -> set[str]:
    rows = (
        session.query(RuleFreshness.rule_id)
        .filter(RuleFreshness.flagged_for_review == True)  # noqa: E712
        .all()
    )
    return {r[0] for r in rows}
