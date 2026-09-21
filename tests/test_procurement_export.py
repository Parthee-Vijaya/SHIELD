"""Word exports preserve historical facts, exact sources and access boundaries."""

from copy import deepcopy
from io import BytesIO
from zipfile import ZipFile

from docx import Document
from fastapi import HTTPException
import pytest

from src.api import procurement as api
from src.api import procurement_exports as exports
from src.services.procurement_export import (
    build_procurement_review_docx,
    fact_value,
    grouped_sources,
)
from tests.test_procurement_analysis import (
    PROFILE,
    save_example,
    setup as procurement_setup,
)


@pytest.fixture
def setup(tmp_path, monkeypatch):
    yield from procurement_setup.__wrapped__(tmp_path, monkeypatch)


def text_of(content):
    doc = Document(BytesIO(content))
    return "\n".join(paragraph.text for paragraph in doc.paragraphs)


def reviewed_case(setup):
    client, factory, case_id = setup
    client.app.include_router(exports.router)
    saved = save_example(factory, case_id, flagged=True)
    response = client.post(
        f"/api/v3/cases/{case_id}/procurement/review",
        json={
            "analysis_id": saved["id"],
            "accepted_fact_ids": ["hosting"],
            "note": "Jura skal afklare aftalens konkrete hostingvilkår og behandlingsgrundlag.",
        },
    )
    assert response.status_code == 201
    return client, factory, case_id, saved, response.json()


def test_word_has_exact_review_facts_citations_jev_and_provenance(setup):
    client, _, case_id, analysis, review = reviewed_case(setup)
    response = client.get(
        f"/api/v3/cases/{case_id}/procurement/reviews/{review['id']}/export.docx"
    )
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert response.headers["cache-control"] == "private, no-store"
    assert "filename*=UTF-8''" in response.headers["content-disposition"]
    assert "%C3%A5" in response.headers["content-disposition"]
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.testzip() is None
    content = text_of(response.content)
    for required in [
        PROFILE["system_name"],
        PROFILE["intended_use"],
        "Kundens data hostes i Danmark.",
        "Side 1",
        "version 1",
        "JEV",
        "fact:hosting",
        "summary",
        "GPT-5.6 Sol",
        "typesafe-ai/jev",
        analysis["id"],
        review["id"],
        review["note"],
        "ikke juridisk godkendt",
        "underskrevet databehandleraftale",
    ]:
        assert required in content
    assert "codex" not in content.lower()
    assert "Kørsel:" not in content


def test_historical_export_retains_snapshot_and_marks_changed_basis(setup):
    client, _, case_id, _, review = reviewed_case(setup)
    changed = client.patch(
        f"/api/v3/cases/{case_id}/procurement",
        json={
            **PROFILE,
            "system_name": "Nyt systemnavn",
            "intended_use": "Et helt andet formål for borgerrelateret sagsbehandling.",
            "revision": 1,
        },
    )
    assert changed.status_code == 200
    response = client.get(
        f"/api/v3/cases/{case_id}/procurement/reviews/{review['id']}/export.docx"
    )
    assert response.status_code == 200
    content = text_of(response.content)
    assert PROFILE["system_name"] in content
    assert PROFILE["intended_use"] in content
    assert "Nyt systemnavn" not in content
    assert "Historisk grundlag" in content


def test_exports_cannot_read_another_cases_review(setup):
    client, _, _, _, review = reviewed_case(setup)
    other = client.post("/api/v3/procurements", json=PROFILE).json()["case_id"]
    response = client.get(
        f"/api/v3/cases/{other}/procurement/reviews/{review['id']}/export.docx"
    )
    assert response.status_code == 404
    assert (
        client.get(
            f"/api/v3/cases/{other}/procurement/reviews/unknown/export.docx"
        ).status_code
        == 404
    )


@pytest.mark.parametrize("status", [401, 403])
def test_authentication_and_role_dependency_is_required(setup, status):
    client, _, case_id, _, review = reviewed_case(setup)

    def denied():
        raise HTTPException(status_code=status, detail="Adgang afvist")

    client.app.dependency_overrides[api.ACCESS] = denied
    assert (
        client.get(
            f"/api/v3/cases/{case_id}/procurement/reviews/{review['id']}/export.docx"
        ).status_code
        == status
    )


def test_plain_text_quotes_urls_and_invalid_xml_are_handled(setup):
    _, _, _, analysis, review = reviewed_case(setup)
    analysis = deepcopy(analysis)
    analysis["summary"] += "\x00 <script>Ingen markup</script>"
    analysis["sources"][0][
        "source_url"
    ] = "https://example.org/aftale?revision=2&language=da"
    result = build_procurement_review_docx(analysis, review)
    content = text_of(result)
    assert "<script>Ingen markup</script>" in content
    assert "https://example.org/aftale?revision=2&language=da" in content
    assert "\x00" not in content
    with ZipFile(BytesIO(result)) as archive:
        assert b"&lt;script&gt;" in archive.read("word/document.xml")
    assert fact_value("transfer_outside_eea", False) == "Nej"
    assert fact_value("data_subjects", ["citizens"]) == "borgere"


def test_unknown_fact_exports_as_unresolved_not_python_none(setup):
    _, _, _, analysis, review = reviewed_case(setup)
    analysis = deepcopy(analysis)
    analysis["facts"][0].update(field="transfer_outside_eea", value=None)
    content = text_of(build_procurement_review_docx(analysis, review))
    assert "Oplysning: Ikke afklaret" in content
    assert "Oplysning: None" not in content
    assert fact_value("transfer_outside_eea", None) == "Ikke afklaret"


def test_unknown_or_crosslinked_snapshot_cannot_export(setup):
    _, _, _, analysis, review = reviewed_case(setup)
    review = deepcopy(review)
    review["analysis_id"] = "another-analysis"
    with pytest.raises(ValueError):
        build_procurement_review_docx(analysis, review)


def test_many_web_paragraphs_are_one_document_source_without_losing_locators(setup):
    _, _, _, analysis, review = reviewed_case(setup)
    analysis = deepcopy(analysis)
    source = analysis["sources"][0]
    analysis["sources"] = [
        {**source, "id": f"document:version1:{index}", "locator": f"Afsnit {index}"}
        for index in range(1, 80)
    ]
    grouped = grouped_sources(analysis["sources"])
    assert len(grouped) == 1
    assert grouped[0]["locator_label"] == "Afsnit 1–79"
    assert len(grouped[0]["ids"]) == 79
    content = text_of(build_procurement_review_docx(analysis, review))
    assert content.count("Dokumentversion: version1") == 1
    assert "Afsnit 1–79" in content
    assert "Kundens data hostes i Danmark." in content
