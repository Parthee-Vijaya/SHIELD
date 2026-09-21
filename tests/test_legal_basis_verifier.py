from __future__ import annotations

from datetime import UTC, datetime
from xml.sax.saxutils import escape

import httpx

from src.services import legal_basis_verifier as verifier


def _request(**overrides):
    values = {
        "legal_basis": "public_task",
        "legal_basis_reference": "Servicelovens § 1, stk. 1",
        "legal_basis_source_url": "https://www.retsinformation.dk/eli/lta/2026/641",
        "special_categories": True,
        "article_9_basis": "substantial_public_interest",
        "criminal_data": True,
        "criminal_data_basis": "public_authority_necessary",
        "criminal_data_legal_reference": "Databeskyttelseslovens § 8",
        "cpr_data": True,
        "cpr_basis": "statutory_authority",
        "cpr_legal_reference": "Databeskyttelseslovens § 11",
    }
    values.update(overrides)
    return verifier.LegalBasisVerificationRequest(**values)


def _install_source_stub(monkeypatch, *, exact=True):
    calls = []

    def fake_get(_client, url, headers):
        calls.append(url)
        definitions = verifier._definitions_for(_request())
        selected = [item for item in definitions if item.source_url == url]
        citation_text = "\n".join(item.exact_text for item in selected) if exact else "ændret tekst"
        if url.endswith("/xml"):
            body = (
                "<Dokument><Meta><DocumentTitle>Testlov</DocumentTitle>"
                "<Status>Valid</Status></Meta>"
                "<Paragraf><Explicatus>§ 1.</Explicatus><Stk><Exitus>"
                f"<Char>{escape(citation_text or 'Gældende bestemmelse')}</Char>"
                "</Exitus></Stk></Paragraf></Dokument>"
            )
        else:
            body = citation_text
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            text=body,
            headers={"content-type": "application/xml" if url.endswith("/xml") else "text/html"},
            request=request,
        )

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    verifier.clear_legal_source_cache()
    return calls


def test_exact_official_citations_are_verified_and_each_document_is_fetched_once(monkeypatch):
    calls = _install_source_stub(monkeypatch)
    result = verifier.verify_legal_basis(
        _request(),
        now=datetime(2026, 8, 31, 12, 0, tzinfo=UTC),
    )
    assert result.status == "verified_sources"
    assert all(item.match_status == "verified_exact" for item in result.receipts)
    assert len(calls) == len(set(calls)) == 4
    assert all(item.source_sha256 for item in result.receipts)


def test_public_task_without_specific_sector_basis_stays_blocked_for_completion(monkeypatch):
    _install_source_stub(monkeypatch)
    result = verifier.verify_legal_basis(_request(
        legal_basis_reference="",
        legal_basis_source_url="",
    ))
    assert result.status == "requires_specific_basis"
    assert "konkret" in result.conclusion.lower()


def test_unselected_basis_without_receipts_is_not_reported_as_a_failed_source_fetch(monkeypatch):
    calls = _install_source_stub(monkeypatch)
    result = verifier.verify_legal_basis(_request(
        legal_basis="not_assessed",
        legal_basis_reference="Jura skal afklare det konkrete behandlingsgrundlag.",
        legal_basis_source_url="",
        special_categories=False, article_9_basis="not_applicable",
        criminal_data=False, criminal_data_basis="not_applicable",
        cpr_data=False, cpr_basis="not_applicable",
    ))
    assert calls == []
    assert result.status == "blocked"
    assert result.selected_basis == "not_assessed"
    assert result.receipts == []
    assert result.status_label == "Behandlingsgrundlag ikke valgt"
    assert "ingen verificeret hjemmelskvittering" in result.conclusion
    assert "officiel kildetekst kunne ikke verificeres" not in result.conclusion


def test_free_text_is_not_accepted_as_a_verified_specific_basis(monkeypatch):
    _install_source_stub(monkeypatch)
    result = verifier.verify_legal_basis(_request(
        legal_basis_reference="Ingen konkret hjemmel er fundet",
    ))
    assert result.status == "blocked"


def test_unsupported_sensitive_data_basis_fails_closed(monkeypatch):
    _install_source_stub(monkeypatch)
    result = verifier.verify_legal_basis(_request(
        criminal_data_basis="explicit_consent",
    ))
    assert result.status == "blocked"


def test_changed_source_text_fails_closed(monkeypatch):
    _install_source_stub(monkeypatch, exact=False)
    result = verifier.verify_legal_basis(_request())
    assert result.status == "blocked"
    assert any(item.required and item.match_status == "changed" for item in result.receipts)
    assert result.status_label == "Kildetjek ikke bestået"
    assert "officiel kildetekst kunne ikke verificeres" in result.conclusion


def test_unofficial_redirect_target_is_rejected(monkeypatch):
    def fake_get(_client, url, headers):
        return httpx.Response(
            200,
            text="official-looking text",
            headers={"content-type": "text/html"},
            request=httpx.Request("GET", "https://evil.example/law"),
        )

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    verifier.clear_legal_source_cache()
    result = verifier.verify_legal_basis(_request())
    assert result.status == "blocked"
    assert all(item.match_status == "unavailable" for item in result.receipts)
