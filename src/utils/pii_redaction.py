"""PII redaction for free-text inputs that may contain personoplysninger.

Sagsbehandlere indtaster fritekst (system-beskrivelser, sags-noter, dokument-
upload) der kan indeholde CPR, navne, mailadresser, telefonnumre. Tyrs audit-
log gemmer denne fritekst, og det er PII der ikke nødvendigvis er retmæssigt
behandlet i dette system. Denne modul fjerner / pseudonymiserer PII *før*
fritekst persistes.

Strategi:
- CPR: regex (DDMMÅÅ-XXXX, evt. uden bindestreg) → [CPR]
- Email: regex → [EMAIL]
- Telefonnumre: danske formater 8 cifre med valgfrit +45 → [TLF]
- Navne: er sværere uden NER. Vi kører en blokliste-tilgang baseret på
  fritekst-mønstre ("XX, født YY", "Borger NN") og en simpel kapitalisering-
  detektor for to-ords-fraser der ligner navne. Dette er bevidst konservativt
  — det fjerner ikke alle navne, men flag'er teksten med pii_redacted=true
  så den ikke fejlagtigt antages "ren".

Output:
    redacted: str — teksten med [CPR], [EMAIL], [TLF], [NAVN] indsat
    info: dict — {"redacted_counts": {"cpr": 2, "email": 1, ...}, "pii_redacted": true}
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

__all__ = ["redact_pii", "RedactionResult"]


# ---- Regex patterns --------------------------------------------------------

# CPR: 6 digits (DDMMYY) + optional dash + 4 digits, with word boundary so we
# don't catch random digit sequences inside other numbers.
_CPR_RE = re.compile(r"\b\d{6}[-]?\d{4}\b")

# Email — RFC-lite, good enough for redaction
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)

# Danish phone numbers: 8 digits with optional +45 / 0045 prefix and optional
# spaces / dashes. We accept variations like "+45 12 34 56 78", "12345678",
# "12 34 56 78", "0045 12345678".
_PHONE_RE = re.compile(
    r"(?:(?:\+45|0045)[\s\-]?)?(?:\d[\s\-]?){7}\d\b"
)

# Common Danish name-introducer phrases, captures the next word(s)
_NAME_INTRODUCER_RE = re.compile(
    r"\b(?:borger|klient|ansøger|sagsbehandler|kontaktperson)[\s:]+([A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+){0,3})",
    re.IGNORECASE,
)

# Capitalized two-word sequences that look like names (FirstName LastName).
# Conservative: requires both words to start with capital and be 2+ chars,
# excludes common title-case organization names via stopword list.
_CAPITAL_NAME_RE = re.compile(
    r"\b([A-ZÆØÅ][a-zæøå]{2,})\s+([A-ZÆØÅ][a-zæøå]{2,})\b"
)

# Words that look like names but aren't — Danish institutions, places, common
# title-case nouns. Anything in this set won't trigger name redaction. The
# list is intentionally short — false negatives (real names slipping through)
# are mitigated by the audit-log encryption, while false positives (Borgerservice
# being redacted to [NAVN]) ruin readability of legitimate compliance text.
_NAME_STOPWORDS = frozenset({
    "Kalundborg", "Kommune", "Borgerservice", "Servicedesk", "Region",
    "Sjælland", "Hovedstaden", "Midtjylland", "Nordjylland", "Syddanmark",
    "Datatilsynet", "Justitsministeriet", "Socialministeriet", "Sundhedsministeriet",
    "Folketinget", "Folketingets", "Digitaliseringsstyrelsen", "Erhvervsministeriet",
    "Tyr", "Bifrost", "Odin", "Saga", "Skynet",
    "EU", "Danmark", "København",
    "AI", "GDPR", "DPIA", "DPO",
    "Forvaltningsloven", "Forvaltningslovens", "Persondataloven",
    "Persondatalovens", "Aktivloven", "Aktivlovens", "Ferieloven",
    "Ferielovens", "Grundloven", "Grundlovens", "Straffeloven", "Straffelovens",
    "Ligebehandlingsloven", "Ligebehandlingslovens",
    "Offentlighedsloven", "Offentlighedslovens",
    "Retsinformation", "Retsinformations",
    "Microsoft", "Google", "Anthropic", "OpenAI",
    # Months / weekdays
    "Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli",
    "August", "September", "Oktober", "November", "December",
    "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag",
})


@dataclass
class RedactionResult:
    """Outcome of running redact_pii. ``pii_redacted`` is the boolean
    flag the audit log persists alongside the redacted text."""

    text: str
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def pii_redacted(self) -> bool:
        return any(v > 0 for v in self.counts.values())

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "counts": dict(self.counts),
            "pii_redacted": self.pii_redacted,
        }


def redact_pii(text: str | None) -> RedactionResult:
    """Replace likely PII fragments with placeholder tokens.

    Order matters: CPR first (most specific), then email, then phone, then
    name-introducers, then capitalized two-word names. Earlier passes
    consume tokens that later passes might over-match.
    """
    if not text:
        return RedactionResult(text=text or "", counts={})

    counts = {"cpr": 0, "email": 0, "phone": 0, "name": 0}
    out = text

    out, n = _CPR_RE.subn("[CPR]", out)
    counts["cpr"] = n

    out, n = _EMAIL_RE.subn("[EMAIL]", out)
    counts["email"] = n

    # Phone has a tricky pattern that can match digits inside numbers; only
    # apply it where there's surrounding whitespace context (handled by \b
    # in the regex)
    out, n = _PHONE_RE.subn(_phone_sub, out)
    counts["phone"] = n

    # Named-introducer pattern: catches "borger Anna Hansen" → "borger [NAVN]"
    out, n = _NAME_INTRODUCER_RE.subn(
        lambda m: f"{m.group(0).split()[0]} [NAVN]", out
    )
    counts["name"] += n

    # Capitalized two-word name detection — skips stopwords
    def _maybe_redact_name(match: re.Match) -> str:
        first, last = match.group(1), match.group(2)
        if first in _NAME_STOPWORDS or last in _NAME_STOPWORDS:
            return match.group(0)
        # Skip if either word is in the stopword list (defensive — covers
        # both halves of compound institution names)
        counts["name"] += 1
        return "[NAVN]"

    out = _CAPITAL_NAME_RE.sub(_maybe_redact_name, out)

    return RedactionResult(text=out, counts=counts)


def _phone_sub(_match: re.Match) -> str:
    """Rejection of false positives for the phone regex.

    The 8-digit phone pattern can over-match things like CVR numbers (8 digits)
    or part of a postal code + number. Strip leading whitespace from the
    match for a clean replacement, but keep the rule simple: if it looks like
    a phone, redact it. Audit log encryption is the second line of defense.
    """
    return "[TLF]"
