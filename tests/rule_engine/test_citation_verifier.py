"""Tests for citation-verifier (M3) — normalization + persistence logic.

Network calls (verify_rule) are not exercised here; they're integration-level.
We test the deterministic parts: text normalization, snippet extraction,
DB persistence and flagged_rule_ids querying.
"""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.connection import Base
from src.rule_engine import audit  # noqa: F401
from src.services import citation_verifier as v3_freshness
from src.services.citation_verifier import (
    _normalize,
    _shortest_signature,
    persist_result,
    list_freshness,
    flagged_rule_ids,
    VerificationResult,
)


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    s = Session()
    try:
        yield s
    finally:
        s.close()


class TestNormalize:
    def test_strips_html_tags(self):
        assert _normalize("<p>hello <b>world</b></p>") == "hello world"

    def test_collapses_whitespace(self):
        assert _normalize("a   b\n\nc\td") == "a b c d"

    def test_handles_unicode_quotes(self):
        # Curly quotes → straight quotes
        assert "\"hello\"" in _normalize("“hello”")

    def test_handles_unicode_dashes(self):
        # em-dash → ascii-hyphen
        assert "-" in _normalize("a—b")

    def test_lowercases(self):
        assert _normalize("HELLO") == "hello"

    def test_empty_input(self):
        assert _normalize("") == ""
        assert _normalize(None) == ""


class TestShortestSignature:
    def test_returns_first_n_chars(self):
        text = "alle de gode regler "
        assert _shortest_signature(text, 10) == "alle de go"

    def test_normalizes_input(self):
        text = "<p>Hello World</p>"
        assert _shortest_signature(text, 10) == "hello worl"

    def test_short_text_returned_in_full(self):
        sig = _shortest_signature("kort", n=100)
        assert sig == "kort"


def test_partial_match_is_flagged_instead_of_verified(monkeypatch):
    citation = "ord " * 40
    body = f"{_shortest_signature(citation, 100)} ændret afslutning"

    def fake_get(_client, url, headers):
        return httpx.Response(
            200,
            text=body,
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    rule = SimpleNamespace(
        id="gdpr.partial",
        kilde=SimpleNamespace(url="https://eur-lex.europa.eu/example", citat=citation),
    )

    result = v3_freshness.verify_rule(rule)

    assert result.citation_found is False
    assert result.flagged_for_review is True
    assert result.snippet and "Delvis match" in result.snippet
    assert result.error_message and "juridisk review" in result.error_message


class TestPersistence:
    def test_persist_creates_new_row(self, session):
        result = VerificationResult(
            rule_id="ai_act.art13.test",
            citation_found=True,
            flagged_for_review=False,
            http_status=200,
            error_message=None,
            source_url="https://example.com/",
            snippet="example snippet",
        )
        persist_result(session, result)
        session.commit()
        rows = list_freshness(session)
        assert len(rows) == 1
        assert rows[0].rule_id == "ai_act.art13.test"
        assert rows[0].citation_found is True

    def test_persist_updates_existing_row(self, session):
        # First run — flagged
        persist_result(
            session,
            VerificationResult(
                rule_id="r1",
                citation_found=False,
                flagged_for_review=True,
                http_status=404,
                error_message="not found",
                source_url="https://example.com/",
                snippet=None,
            ),
        )
        # Second run — found
        persist_result(
            session,
            VerificationResult(
                rule_id="r1",
                citation_found=True,
                flagged_for_review=False,
                http_status=200,
                error_message=None,
                source_url="https://example.com/",
                snippet="found",
            ),
        )
        session.commit()
        rows = list_freshness(session)
        assert len(rows) == 1
        assert rows[0].citation_found is True
        assert rows[0].flagged_for_review is False
        assert rows[0].http_status == 200

    def test_flagged_rule_ids_returns_only_flagged(self, session):
        for r in [
            VerificationResult("r1", True, False, 200, None, "u1", None),
            VerificationResult("r2", False, True, 404, "missing", "u2", None),
            VerificationResult("r3", False, True, 200, "no match", "u3", None),
            VerificationResult("r4", True, False, 200, None, "u4", None),
        ]:
            persist_result(session, r)
        session.commit()
        flagged = flagged_rule_ids(session)
        assert flagged == {"r2", "r3"}

    def test_snippet_is_truncated_to_500_chars(self, session):
        long_snippet = "x" * 1000
        persist_result(
            session,
            VerificationResult(
                rule_id="r1",
                citation_found=True,
                flagged_for_review=False,
                http_status=200,
                error_message=None,
                source_url="u",
                snippet=long_snippet,
            ),
        )
        session.commit()
        rows = list_freshness(session)
        assert len(rows[0].snippet) == 500
