"""Live verification of the official legal sources used by the DPIA flow.

The verifier is deliberately narrow.  The client selects a known legal basis,
while the server owns every URL and every expected citation.  This prevents an
arbitrary URL from turning the endpoint into an SSRF proxy and makes each
receipt reproducible.  Finding the cited text proves source integrity only; it
does not decide whether the provision is legally applicable to the processing.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from html import unescape
import re
import threading
from typing import Literal
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx
from pydantic import BaseModel, ConfigDict, Field

from src.services.citation_verifier import _normalize


# EUR-Lex resolves the CELEX identifier to this Danish XHTML manifestation in
# the EU Publications Office's Cellar.  Using the HTTPS manifestation directly
# avoids EUR-Lex' client-side shell and an HTTP downgrade in its redirect.
GDPR_SOURCE_URL = (
    "https://publications.europa.eu/resource/cellar/"
    "3e485e15-11bd-11e6-ba9a-01aa75ed71a1.0003.03/DOC_1"
)
GDPR_DISPLAY_URL = "https://eur-lex.europa.eu/eli/reg/2016/679/oj/dan"
DANISH_DPA_SOURCE_URL = "https://www.retsinformation.dk/eli/lta/2024/289/xml"
DANISH_DPA_DISPLAY_URL = "https://www.retsinformation.dk/eli/lta/2024/289"
DATA_PROTECTION_GUIDANCE_URL = (
    "https://www.datatilsynet.dk/regler-og-vejledning/grundlaeggende-begreber/"
    "hvornaar-maa-du-behandle-personoplysninger"
)

_ALLOWED_HOSTS = frozenset({
    "eur-lex.europa.eu",
    "www.eur-lex.europa.eu",
    "publications.europa.eu",
    "retsinformation.dk",
    "www.retsinformation.dk",
    "datatilsynet.dk",
    "www.datatilsynet.dk",
})
_MAX_SOURCE_BYTES = 3_000_000
_CACHE_TTL = timedelta(hours=6)

LegalBasis = Literal[
    "public_task", "legal_obligation", "contract", "consent",
    "legitimate_interests", "not_assessed",
]
Article9Basis = Literal[
    "not_applicable", "explicit_consent", "employment_social_security",
    "vital_interests", "nonprofit_members", "manifestly_public", "legal_claims",
    "substantial_public_interest", "health_social_care", "public_health",
    "research_statistics", "not_assessed",
]
CriminalDataBasis = Literal[
    "not_applicable", "public_authority_necessary", "explicit_consent",
    "legitimate_interest_clearly_outweighs", "legal_claims", "not_assessed",
]
CPRBasis = Literal[
    "not_applicable", "statutory_authority", "explicit_consent",
    "article_9_basis", "public_authority_disclosure", "not_assessed",
]


class LegalBasisVerificationRequest(BaseModel):
    """The minimum assessment state needed to choose official citations."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    legal_basis: LegalBasis
    legal_basis_reference: str = Field(default="", max_length=2_000)
    legal_basis_source_url: str = Field(default="", max_length=2_000)
    special_categories: bool = False
    article_9_basis: Article9Basis = "not_applicable"
    criminal_data: bool = False
    criminal_data_basis: CriminalDataBasis = "not_applicable"
    criminal_data_legal_reference: str = Field(default="", max_length=2_000)
    cpr_data: bool = False
    cpr_basis: CPRBasis = "not_applicable"
    cpr_legal_reference: str = Field(default="", max_length=2_000)


class LegalCitationReceipt(BaseModel):
    citation_id: str
    law: str
    provision: str
    authority: str
    official_url: str
    match_status: Literal["verified_exact", "changed", "unavailable"]
    checked_at: datetime
    fetched_at: datetime | None = None
    source_sha256: str | None = None
    http_status: int | None = None
    cached: bool = False
    required: bool = True
    source_title: str | None = None
    source_status: str | None = None
    matched_excerpt: str | None = None
    message: str


class LegalBasisVerificationResponse(BaseModel):
    status: Literal["verified_sources", "requires_specific_basis", "blocked"]
    status_label: str
    checked_at: datetime
    selected_basis: LegalBasis
    specific_reference: str
    conclusion: str
    receipts: list[LegalCitationReceipt]
    warnings: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class CitationDefinition:
    citation_id: str
    law: str
    provision: str
    authority: str
    source_url: str
    display_url: str
    exact_text: str
    required: bool = True
    provision_reference: str | None = None
    require_current: bool = False


@dataclass(frozen=True)
class CachedDocument:
    fetched_at: datetime
    normalized_text: str
    raw_text: str
    source_sha256: str
    http_status: int
    source_title: str | None = None
    source_status: str | None = None


_DOCUMENT_CACHE: dict[str, CachedDocument] = {}
_CACHE_LOCK = threading.Lock()


_ARTICLE_6 = {
    "consent": (
        "gdpr.art6.a",
        "Artikel 6, stk. 1, litra a",
        "Den registrerede har givet samtykke til behandling af sine "
        "personoplysninger til et eller flere specifikke formål.",
    ),
    "contract": (
        "gdpr.art6.b",
        "Artikel 6, stk. 1, litra b",
        "Behandling er nødvendig af hensyn til opfyldelse af en kontrakt, som "
        "den registrerede er part i, eller af hensyn til gennemførelse af "
        "foranstaltninger, der træffes på den registreredes anmodning forud for "
        "indgåelse af en kontrakt.",
    ),
    "legal_obligation": (
        "gdpr.art6.c",
        "Artikel 6, stk. 1, litra c",
        "Behandling er nødvendig for at overholde en retlig forpligtelse, som "
        "påhviler den dataansvarlige.",
    ),
    "public_task": (
        "gdpr.art6.e",
        "Artikel 6, stk. 1, litra e",
        "Behandling er nødvendig af hensyn til udførelse af en opgave i "
        "samfundets interesse eller som henhører under offentlig "
        "myndighedsudøvelse, som den dataansvarlige har fået pålagt.",
    ),
    "legitimate_interests": (
        "gdpr.art6.f",
        "Artikel 6, stk. 1, litra f",
        "Behandling er nødvendig for, at den dataansvarlige eller en tredjemand "
        "kan forfølge en legitim interesse, medmindre den registreredes "
        "interesser eller grundlæggende rettigheder og frihedsrettigheder, der "
        "kræver beskyttelse af personoplysninger, går forud herfor.",
    ),
}

_ARTICLE_9 = {
    "explicit_consent": (
        "a", "den registrerede har givet udtrykkeligt samtykke til behandling "
        "af sådanne personoplysninger til et eller flere specifikke formål"
    ),
    "employment_social_security": (
        "b", "behandling er nødvendig for at overholde den dataansvarliges "
        "eller den registreredes arbejds-, sundheds- og socialretlige "
        "forpligtelser og specifikke rettigheder"
    ),
    "vital_interests": (
        "c", "behandling er nødvendig for at beskytte den registreredes eller "
        "en anden fysisk persons vitale interesser"
    ),
    "nonprofit_members": (
        "d", "behandling foretages af et politisk, filosofisk, religiøst eller "
        "fagforeningsmæssigt organ, som ikke arbejder med gevinst for øje"
    ),
    "manifestly_public": (
        "e", "behandling vedrører personoplysninger, som tydeligvis er "
        "offentliggjort af den registrerede"
    ),
    "legal_claims": (
        "f", "behandling er nødvendig, for at retskrav kan fastlægges, gøres "
        "gældende eller forsvares"
    ),
    "substantial_public_interest": (
        "g", "behandling er nødvendig af hensyn til væsentlige "
        "samfundsinteresser på grundlag af EU-retten eller medlemsstaternes "
        "nationale ret"
    ),
    "health_social_care": (
        "h", "behandling er nødvendig med henblik på forebyggende medicin eller "
        "arbejdsmedicin til vurdering af arbejdstagerens erhvervsevne, medicinsk "
        "diagnose, ydelse af social- og sundhedsomsorg eller -behandling"
    ),
    "public_health": (
        "i", "behandling er nødvendig af hensyn til samfundsinteresser på "
        "folkesundhedsområdet"
    ),
    "research_statistics": (
        "j", "behandling er nødvendig til arkivformål i samfundets interesse, "
        "til videnskabelige eller historiske forskningsformål eller til "
        "statistiske formål"
    ),
}

_ARTICLE_9_REQUIRING_SPECIFIC_LAW = frozenset({
    "employment_social_security",
    "substantial_public_interest",
    "health_social_care",
    "public_health",
    "research_statistics",
})

_RETSINFO_ELI_PATH = re.compile(
    r"^/eli/lta/(?P<year>\d{4})/(?P<number>\d+)(?:/(?:dan|xml|rawhtml|pdf))*/*$",
    re.IGNORECASE,
)
_SECTION_REFERENCE = re.compile(
    r"§{1,2}\s*(?P<number>\d+)\s*(?P<letter>[a-zæøå]?)",
    re.IGNORECASE,
)
_SUBSECTION_REFERENCE = re.compile(r"stk\.?\s*(?P<number>\d+)", re.IGNORECASE)


def _needs_specific_official_source(request: LegalBasisVerificationRequest) -> bool:
    return (
        request.legal_basis in {"public_task", "legal_obligation"}
        or (
            request.special_categories
            and request.article_9_basis in _ARTICLE_9_REQUIRING_SPECIFIC_LAW
        )
    )


def _canonical_retsinfo_url(url: str) -> tuple[str, str] | None:
    """Return a machine-readable and a display URL for an official ELI link."""

    if not url:
        return None
    parsed = urlparse(url.strip())
    hostname = (parsed.hostname or "").lower()
    match = _RETSINFO_ELI_PATH.fullmatch(parsed.path)
    if parsed.scheme != "https" or hostname not in {
        "retsinformation.dk", "www.retsinformation.dk",
    } or not match:
        return None
    base = (
        f"https://www.retsinformation.dk/eli/lta/"
        f"{match.group('year')}/{match.group('number')}"
    )
    return f"{base}/xml", base


def _xml_value(root: ElementTree.Element, name: str) -> str | None:
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == name:
            value = " ".join(element.itertext()).strip()
            if value:
                return value
    return None


def _retsinfo_metadata(raw_text: str) -> tuple[str | None, str | None]:
    try:
        root = ElementTree.fromstring(raw_text)
    except ElementTree.ParseError:
        return None, None
    title = _xml_value(root, "PopularTitle") or _xml_value(root, "DocumentTitle")
    status = _xml_value(root, "Status")
    return title, status


def _match_retsinfo_provision(
    raw_text: str,
    reference: str,
) -> tuple[bool, str | None, str]:
    """Match a section/stk. against the actual XML structure, not cross-references."""

    requested = _SECTION_REFERENCE.search(reference or "")
    if not requested:
        return False, None, "Angiv en konkret paragraf, fx § 82, stk. 1."
    requested_key = f"{requested.group('number')}{requested.group('letter').lower()}"
    requested_subsection = _SUBSECTION_REFERENCE.search(reference or "")

    try:
        root = ElementTree.fromstring(raw_text)
    except ElementTree.ParseError:
        return False, None, "Den officielle kilde kunne ikke læses som Retsinformation-XML."

    for paragraph in root.iter():
        if paragraph.tag.rsplit("}", 1)[-1] != "Paragraf":
            continue
        heading = next((
            " ".join(child.itertext()).strip()
            for child in paragraph
            if child.tag.rsplit("}", 1)[-1] == "Explicatus"
        ), "")
        candidate = _SECTION_REFERENCE.search(heading)
        if not candidate:
            continue
        candidate_key = f"{candidate.group('number')}{candidate.group('letter').lower()}"
        if candidate_key != requested_key:
            continue

        paragraph_text = re.sub(r"\s+", " ", " ".join(paragraph.itertext())).strip()
        excerpt = paragraph_text[:700]
        if "(ophævet)" in paragraph_text.lower():
            return False, excerpt, "Bestemmelsen er markeret som ophævet i Retsinformation."

        if requested_subsection:
            subsection_number = int(requested_subsection.group("number"))
            subsections = [
                child for child in paragraph
                if child.tag.rsplit("}", 1)[-1] == "Stk"
            ]
            if subsection_number < 1 or subsection_number > len(subsections):
                return False, excerpt, "Det angivne stykke findes ikke i bestemmelsen."

        return True, excerpt, "Bestemmelsen findes i den strukturerede officielle lovtekst."

    return False, None, "Den angivne paragraf blev ikke fundet som en bestemmelse i lovteksten."


def _gdpr_definition(
    citation_id: str,
    provision: str,
    exact_text: str,
    *,
    required: bool = True,
) -> CitationDefinition:
    return CitationDefinition(
        citation_id=citation_id,
        law="Databeskyttelsesforordningen (GDPR)",
        provision=provision,
        authority="EUR-Lex",
        source_url=GDPR_SOURCE_URL,
        display_url=GDPR_DISPLAY_URL,
        exact_text=exact_text,
        required=required,
    )


def _definitions_for(request: LegalBasisVerificationRequest) -> list[CitationDefinition]:
    definitions: list[CitationDefinition] = []
    article_6 = _ARTICLE_6.get(request.legal_basis)
    if article_6:
        definitions.append(_gdpr_definition(*article_6))

    if request.special_categories and request.article_9_basis in _ARTICLE_9:
        letter, exact_text = _ARTICLE_9[request.article_9_basis]
        definitions.append(_gdpr_definition(
            f"gdpr.art9.{letter}",
            f"Artikel 9, stk. 2, litra {letter}",
            exact_text,
        ))

    if request.criminal_data:
        definitions.append(_gdpr_definition(
            "gdpr.art10",
            "Artikel 10",
            "Behandling af personoplysninger vedrørende straffedomme og "
            "lovovertrædelser eller tilknyttede sikkerhedsforanstaltninger "
            "på grundlag af artikel 6, stk. 1, må kun foretages under "
            "kontrol af en offentlig myndighed",
        ))
        if request.criminal_data_basis == "public_authority_necessary":
            definitions.append(CitationDefinition(
                citation_id="databeskyttelsesloven.par8",
                law="Databeskyttelsesloven",
                provision="§ 8, stk. 1",
                authority="Retsinformation",
                source_url=DANISH_DPA_SOURCE_URL,
                display_url=DANISH_DPA_DISPLAY_URL,
                exact_text="For den offentlige forvaltning må der ikke behandles "
                "oplysninger om strafbare forhold, medmindre det er nødvendigt "
                "for varetagelsen af myndighedens opgaver.",
                require_current=True,
            ))

    if request.cpr_data and request.cpr_basis == "statutory_authority":
        definitions.append(CitationDefinition(
            citation_id="databeskyttelsesloven.par11",
            law="Databeskyttelsesloven",
            provision="§ 11, stk. 1",
            authority="Retsinformation",
            source_url=DANISH_DPA_SOURCE_URL,
            display_url=DANISH_DPA_DISPLAY_URL,
            exact_text="Offentlige myndigheder kan behandle oplysninger om "
            "personnummer med henblik på en entydig identifikation eller som "
            "journalnummer.",
            require_current=True,
        ))

    concrete_source = _canonical_retsinfo_url(request.legal_basis_source_url)
    if _needs_specific_official_source(request) and concrete_source:
        source_url, display_url = concrete_source
        definitions.append(CitationDefinition(
            citation_id="specific.legal_basis",
            law="Konkret sektorhjemmel",
            provision=request.legal_basis_reference or "Ikke angivet",
            authority="Retsinformation",
            source_url=source_url,
            display_url=display_url,
            exact_text="",
            provision_reference=request.legal_basis_reference,
            require_current=True,
        ))

    if request.legal_basis in {"public_task", "legal_obligation"}:
        definitions.append(CitationDefinition(
            citation_id="datatilsynet.behandlingsgrundlag.offentlig",
            law="Datatilsynets vejledning om behandlingsgrundlag",
            provision="Offentlig myndighedsudøvelse",
            authority="Datatilsynet",
            source_url=DATA_PROTECTION_GUIDANCE_URL,
            display_url=DATA_PROTECTION_GUIDANCE_URL,
            exact_text="Behandling er nødvendig af hensyn til en opgave i "
            "samfundets interesse eller offentlig myndighedsudøvelse.",
            required=False,
        ))
    return definitions


def _validate_official_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in _ALLOWED_HOSTS:
        raise ValueError("Kilden er ikke på listen over tilladte officielle domæner")


def _cached_document(url: str, now: datetime) -> CachedDocument | None:
    with _CACHE_LOCK:
        document = _DOCUMENT_CACHE.get(url)
    if document and now - document.fetched_at <= _CACHE_TTL:
        return document
    return None


def _fetch_document(
    client: httpx.Client,
    url: str,
    *,
    now: datetime,
) -> tuple[CachedDocument, bool]:
    cached = _cached_document(url, now)
    if cached:
        return cached, True

    _validate_official_url(url)
    response = client.get(
        url,
        headers={
            "Accept": (
                "application/xhtml+xml, text/html;q=0.9, "
                "application/xml;q=0.8, text/xml;q=0.8"
            ),
            "Accept-Language": "da,dan;q=0.9",
            "Accept-Max-Cs-Size": str(_MAX_SOURCE_BYTES),
            "User-Agent": "SHIELD/1.0 legal-source-verifier",
        },
    )
    _validate_official_url(str(response.url))
    if response.status_code != 200:
        raise ValueError(
            f"Den officielle kilde returnerede HTTP {response.status_code}"
        )
    if not response.content:
        raise ValueError("Den officielle kilde returnerede ikke nogen lovtekst")
    if len(response.content) > _MAX_SOURCE_BYTES:
        raise ValueError("Den officielle kilde overskrider den tilladte størrelse")
    content_type = response.headers.get("content-type", "").lower()
    if not any(media_type in content_type for media_type in (
        "text/html", "application/xhtml+xml", "application/xml", "text/xml",
    )):
        raise ValueError("Den officielle kilde returnerede et uventet format")

    decoded = response.content.decode(response.encoding or "utf-8", errors="replace")
    source_title = None
    source_status = None
    if (urlparse(str(response.url)).hostname or "").lower().endswith("retsinformation.dk"):
        source_title, source_status = _retsinfo_metadata(decoded)
    document = CachedDocument(
        fetched_at=now,
        normalized_text=_normalize(unescape(decoded)),
        raw_text=decoded,
        source_sha256=sha256(response.content).hexdigest(),
        http_status=response.status_code,
        source_title=source_title,
        source_status=source_status,
    )
    with _CACHE_LOCK:
        _DOCUMENT_CACHE[url] = document
    return document, False


def _receipt_for(
    definition: CitationDefinition,
    *,
    document: CachedDocument | None,
    cached: bool,
    checked_at: datetime,
    unavailable: bool = False,
) -> LegalCitationReceipt:
    matched_excerpt = None
    provision_message = ""
    if document and definition.provision_reference:
        provision_match, matched_excerpt, provision_message = _match_retsinfo_provision(
            document.raw_text,
            definition.provision_reference,
        )
        exact_match = provision_match
    else:
        exact_match = bool(
            document
            and definition.exact_text
            and _normalize(definition.exact_text) in document.normalized_text
        )

    current_source = bool(
        not definition.require_current
        or (document and document.source_status == "Valid")
    )
    exact_match = exact_match and current_source
    if unavailable:
        match_status = "unavailable"
        message = "Kilden kunne ikke hentes nu; kontrollen er derfor ikke bestået."
    elif definition.require_current and document and document.source_status != "Valid":
        match_status = "changed"
        message = (
            "Retsinformation markerer ikke dokumentet som gældende "
            f"(status: {document.source_status or 'ukendt'})."
        )
    elif exact_match:
        match_status = "verified_exact"
        message = provision_message or (
            "Den forventede bestemmelsestekst blev genfundet ordret efter normalisering."
        )
    else:
        match_status = "changed"
        message = provision_message or (
            "Den forventede bestemmelsestekst blev ikke genfundet; juridisk review er påkrævet."
        )
    return LegalCitationReceipt(
        citation_id=definition.citation_id,
        law=(document.source_title if document and definition.provision_reference else None) or definition.law,
        provision=definition.provision,
        authority=definition.authority,
        official_url=definition.display_url,
        match_status=match_status,
        checked_at=checked_at,
        fetched_at=document.fetched_at if document else None,
        source_sha256=document.source_sha256 if document else None,
        http_status=document.http_status if document else None,
        cached=cached,
        required=definition.required,
        source_title=document.source_title if document else None,
        source_status=document.source_status if document else None,
        matched_excerpt=matched_excerpt,
        message=message,
    )


def verify_legal_basis(
    request: LegalBasisVerificationRequest,
    *,
    now: datetime | None = None,
    timeout: float = 15.0,
) -> LegalBasisVerificationResponse:
    """Verify exact citations in the current official source documents.

    A failure is represented in the returned receipt instead of being raised.
    That lets an assessment be persisted as blocked with an auditable reason.
    """

    checked_at = now or datetime.now(UTC)
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    definitions = _definitions_for(request)
    documents: dict[str, tuple[CachedDocument | None, bool, bool]] = {}

    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        for definition in definitions:
            if definition.source_url in documents:
                continue
            try:
                document, cached = _fetch_document(
                    client,
                    definition.source_url,
                    now=checked_at,
                )
                documents[definition.source_url] = (document, cached, False)
            except (httpx.HTTPError, UnicodeError, ValueError):
                documents[definition.source_url] = (None, False, True)

    receipts = [
        _receipt_for(
            definition,
            document=documents[definition.source_url][0],
            cached=documents[definition.source_url][1],
            unavailable=documents[definition.source_url][2],
            checked_at=checked_at,
        )
        for definition in definitions
    ]

    warnings: list[str] = [
        "Kildetjekket bekræfter lovtekstens integritet, ikke at bestemmelsen er "
        "den korrekte hjemmel for den konkrete behandling.",
    ]
    if request.legal_basis == "legitimate_interests":
        warnings.append(
            "Offentlige myndigheder kan som udgangspunkt ikke bruge artikel 6, "
            "stk. 1, litra f, når behandlingen sker som led i deres opgaver."
        )
    if request.legal_basis == "consent":
        warnings.append(
            "Samtykke i et myndigheds- eller ansættelsesforhold kræver særlig "
            "kontrol af frivillighed og magtforhold."
        )

    needs_specific_source = _needs_specific_official_source(request)
    canonical_specific_source = _canonical_retsinfo_url(
        request.legal_basis_source_url
    )
    has_structured_reference = bool(
        _SECTION_REFERENCE.search(request.legal_basis_reference)
    )
    missing_specific_reference = bool(
        needs_specific_source
        and (
            len(request.legal_basis_reference.strip()) < 5
            or not has_structured_reference
            or canonical_specific_source is None
        )
    )
    if needs_specific_source and canonical_specific_source is None:
        warnings.append(
            "Den konkrete hjemmel kræver et HTTPS-link til en lovtekst under "
            "retsinformation.dk/eli/lta/."
        )

    criminal_reference_matches = bool(re.search(
        r"§{1,2}\s*8(?!\d)",
        request.criminal_data_legal_reference,
        re.IGNORECASE,
    ))
    cpr_reference_matches = bool(re.search(
        r"§{1,2}\s*11(?!\d)",
        request.cpr_legal_reference,
        re.IGNORECASE,
    ))
    if request.criminal_data and not criminal_reference_matches:
        missing_specific_reference = True
    if request.cpr_data and not cpr_reference_matches:
        missing_specific_reference = True

    unsupported_sensitive_basis = bool(
        request.criminal_data
        and request.criminal_data_basis != "public_authority_necessary"
    ) or bool(
        request.cpr_data
        and request.cpr_basis != "statutory_authority"
    )
    if unsupported_sensitive_basis:
        warnings.append(
            "Det valgte grundlag for strafoplysninger eller CPR kan ikke "
            "verificeres automatisk i kommunesporet og kræver juridisk review."
        )
    unresolved_basis = (
        request.legal_basis == "not_assessed"
        or (request.special_categories and request.article_9_basis in {"not_applicable", "not_assessed"})
        or unsupported_sensitive_basis
    )
    required_failed = any(
        receipt.required and receipt.match_status != "verified_exact"
        for receipt in receipts
    )

    if request.legal_basis == "not_assessed" and not receipts:
        status = "blocked"
        status_label = "Behandlingsgrundlag ikke valgt"
        conclusion = (
            "Behandlingsgrundlaget er ikke valgt eller afklaret. Der foreligger "
            "derfor ingen verificeret hjemmelskvittering. Vurderingen skal "
            "forblive blokeret, indtil grundlaget er dokumenteret og kontrolleret."
        )
    elif unresolved_basis or required_failed or not receipts:
        status = "blocked"
        status_label = "Kildetjek ikke bestået"
        conclusion = (
            "Mindst én nødvendig officiel kildetekst kunne ikke verificeres "
            "eksakt. Vurderingen skal forblive blokeret til nyt tjek og juridisk review."
        )
    elif missing_specific_reference:
        status = "requires_specific_basis"
        status_label = "Generelle kilder fundet – konkret hjemmel mangler"
        conclusion = (
            "De generelle kildetekster blev verificeret, men den konkrete "
            "sektorlov skal angives med paragraf og officielt Retsinformation-link."
        )
    else:
        status = "verified_sources"
        status_label = "Officielle kildetekster verificeret"
        conclusion = (
            "De forventede tekster blev genfundet i de officielle kilder. "
            "Juridisk relevans og nødvendighed kræver fortsat faglig godkendelse."
        )

    return LegalBasisVerificationResponse(
        status=status,
        status_label=status_label,
        checked_at=checked_at,
        selected_basis=request.legal_basis,
        specific_reference=request.legal_basis_reference,
        conclusion=conclusion,
        receipts=receipts,
        warnings=warnings,
    )


def clear_legal_source_cache() -> None:
    """Test/operations hook; production callers normally rely on the TTL."""

    with _CACHE_LOCK:
        _DOCUMENT_CACHE.clear()
