"""Tests for src.utils.pii_redaction — Danish-specific PII redaction."""

from src.utils.pii_redaction import redact_pii


# ---- CPR --------------------------------------------------------------------

def test_cpr_with_dash():
    r = redact_pii("CPR: 010190-1234 har søgt pension.")
    assert r.text == "CPR: [CPR] har søgt pension."
    assert r.counts["cpr"] == 1
    assert r.pii_redacted is True


def test_cpr_without_dash():
    r = redact_pii("Borger 0101901234 er omfattet")
    assert r.counts["cpr"] == 1
    assert "[CPR]" in r.text


def test_cpr_multiple():
    r = redact_pii("Hovedperson 010190-1234 og partner 020290-5678")
    assert r.counts["cpr"] == 2
    assert r.text.count("[CPR]") == 2


# ---- Email ------------------------------------------------------------------

def test_email_basic():
    r = redact_pii("Send til pavi@kalundborg.dk for spørgsmål")
    assert "[EMAIL]" in r.text
    assert "pavi@kalundborg.dk" not in r.text
    assert r.counts["email"] == 1


def test_email_with_subaddress():
    r = redact_pii("Anna.Hansen+ferie@gmail.com")
    assert r.counts["email"] == 1
    assert "[EMAIL]" in r.text


# ---- Phone ------------------------------------------------------------------

def test_phone_8_digits():
    r = redact_pii("Ring på 12345678 hvis spørgsmål")
    assert r.counts["phone"] == 1
    assert "[TLF]" in r.text


def test_phone_with_country_code():
    r = redact_pii("Telefon: +45 12 34 56 78")
    assert r.counts["phone"] == 1
    assert "12 34 56 78" not in r.text


# ---- Names ------------------------------------------------------------------

def test_name_after_introducer():
    r = redact_pii("Borger Anna Hansen har søgt om pension.")
    assert "[NAVN]" in r.text
    assert "Anna Hansen" not in r.text
    assert r.counts["name"] >= 1


def test_capitalized_two_words():
    r = redact_pii("Sagen vedrører Niels Larsen og hans pensionsansøgning.")
    assert "[NAVN]" in r.text
    assert "Niels Larsen" not in r.text


def test_kalundborg_kommune_not_redacted():
    """Kalundborg + Kommune are stopwords — must NOT be redacted as a name."""
    r = redact_pii("Sagen behandles af Kalundborg Kommune jf. forvaltningsloven")
    assert "Kalundborg Kommune" in r.text
    assert "[NAVN]" not in r.text


def test_government_agencies_not_redacted():
    r = redact_pii("Datatilsynet vurderer at Region Sjælland har ret")
    assert "Datatilsynet" in r.text
    assert "Region Sjælland" in r.text


def test_law_names_not_redacted():
    """Forvaltningsloven, Persondataloven etc. shouldn't be flagged."""
    r = redact_pii("Forvaltningsloven § 19 og Persondatalovens § 28")
    assert "Forvaltningsloven" in r.text
    assert "Persondatalovens" in r.text


# ---- Combined ---------------------------------------------------------------

def test_combined_pii():
    text = (
        "Borger Anna Hansen (CPR: 010190-1234) har sendt mail til "
        "pavi@kalundborg.dk fra +45 12345678."
    )
    r = redact_pii(text)
    assert r.counts["cpr"] == 1
    assert r.counts["email"] == 1
    assert r.counts["phone"] == 1
    assert r.counts["name"] >= 1
    assert "Anna Hansen" not in r.text
    assert "010190-1234" not in r.text
    assert "pavi@kalundborg.dk" not in r.text


def test_no_pii_clean_text():
    text = "AI Act art. 5 forbyder social scoring i offentlig sektor."
    r = redact_pii(text)
    assert r.text == text  # unchanged
    assert r.pii_redacted is False
    assert sum(r.counts.values()) == 0


def test_empty_input():
    assert redact_pii("").text == ""
    assert redact_pii(None).text == ""
    assert redact_pii(None).pii_redacted is False


def test_to_dict_shape():
    r = redact_pii("Anna Hansen, CPR 010190-1234")
    d = r.to_dict()
    assert "text" in d
    assert "counts" in d
    assert "pii_redacted" in d
    assert d["pii_redacted"] is True
