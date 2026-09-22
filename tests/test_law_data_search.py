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


DBA_QUESTION = (
    "Hvad er formålet med en databehandleraftale? Giv et kort overblik med kilder "
    "og angiv, hvad en fagperson skal kontrollere."
)


def test_answer_instructions_cannot_introduce_unrelated_laws(monkeypatch):
    catalogue = [
        {"title": "Aktivloven § 1", "summary": "Formålet med at give hjælp.", "content": "Kort og længere overblik."},
        {"title": "Ferieloven § 1", "summary": "", "content": "Forhold angivet i loven og forkortelser."},
        {"title": "Ligebehandlingsloven § 1", "summary": "", "content": "Der gives oplysninger."},
        {"title": "Forvaltningsloven § 1", "summary": "", "content": "Det skal kontrolleres."},
        {"title": "Persondataloven § 1", "summary": "", "content": "Fagpersoner og kildehenvisninger."},
    ]
    monkeypatch.setattr(law_data, "get_all_laws", lambda: catalogue)
    assert law_data.search_laws(DBA_QUESTION) == []
    assert law_data.search_laws("Giv et kort overblik med kilder og relevante eksempler.") == []
    assert law_data.search_laws("Vil du gerne give en kort forklaring på databehandleraftalen samt finde relevante kilder?") == []


def test_actual_domain_term_remains_searchable_despite_answer_instructions(monkeypatch):
    catalogue = [
        {"title": "Katalogtekst A", "slug": "a", "content": "Denne tekst indeholder ordet databehandleraftalen."},
        {"title": "Katalogtekst B", "slug": "b", "content": "Formålet er at give et kort overblik."},
    ]
    monkeypatch.setattr(law_data, "get_all_laws", lambda: catalogue)
    results = law_data.search_laws(DBA_QUESTION)
    assert [result["law"]["slug"] for result in results] == ["a"]
    assert "content" in results[0]["matches"]


def test_short_terms_require_whole_words(monkeypatch):
    catalogue = [
        {"title": "Katalogtekst A", "slug": "a", "content": "En dom er nævnt i teksten."},
        {"title": "Katalogtekst B", "slug": "b", "content": "Ordene ejendom og belønning er nævnt."},
    ]
    monkeypatch.setattr(law_data, "get_all_laws", lambda: catalogue)
    assert [result["law"]["slug"] for result in law_data.search_laws("dom")] == ["a"]
    assert law_data.search_laws("løn") == []


def test_long_domain_terms_keep_inflections_and_compounds(monkeypatch):
    catalogue = [
        {"title": "Katalogtekst A", "slug": "a", "content": "Personoplysninger og tilsynspligt er nævnt."},
    ]
    monkeypatch.setattr(law_data, "get_all_laws", lambda: catalogue)
    assert law_data.search_laws("personoplysningernes")
    assert law_data.search_laws("tilsyn")
    assert law_data.search_laws("plysning") == []
