"""Regression coverage for named-law retrieval without any model/provider calls."""

import pytest

from src.law import law_data


@pytest.fixture
def catalogue(monkeypatch):
    laws = [
        {"title": "Ferieloven § 1", "slug": "ferieloven", "category": "arbejde",
         "summary": "Ferie og lønmodtagere", "content": "Lovens anvendelsesområde."},
        {"title": "Grundloven § 1.", "slug": "grundloven", "category": "stat",
         "summary": "Grundlovens anvendelsesområde", "content": "Lovens anvendelsesområde."},
        {"title": "Straffeloven § 1", "slug": "straffeloven", "category": "straf",
         "summary": "Lovens anvendelsesområde", "content": "Lovens anvendelsesområde."},
    ]
    monkeypatch.setattr(law_data, "get_all_laws", lambda: laws)
    return laws


def test_explicit_law_name_excludes_generic_content_matches(catalogue):
    results = law_data.search_laws("Hvad siger Ferieloven om lovens anvendelsesområde?")
    assert [result["law"]["slug"] for result in results] == ["ferieloven"]
    assert "explicit_title" in results[0]["matches"]


def test_named_law_accepts_genitive_and_case(catalogue):
    results = law_data.search_laws("Hvad er FERIELOVENS anvendelsesområde?")
    assert [result["law"]["slug"] for result in results] == ["ferieloven"]


def test_multiple_named_laws_remain_available(catalogue):
    results = law_data.search_laws("Sammenlign Ferieloven med Straffelovens anvendelsesområde")
    assert {result["law"]["slug"] for result in results} == {"ferieloven", "straffeloven"}


def test_unqualified_search_still_uses_relevance(catalogue):
    assert len(law_data.search_laws("lovens anvendelsesområde")) == 3


def test_category_filter_does_not_reintroduce_unrelated_laws(catalogue):
    assert law_data.search_laws("Ferieloven anvendelsesområde", category="stat") == []


def test_law_name_match_requires_word_boundaries(catalogue):
    results = law_data.search_laws("antiFerieloven anvendelsesområde")
    assert len(results) == 3
    assert all("explicit_title" not in result["matches"] for result in results)
