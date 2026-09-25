"""Municipal needs retain provenance through intake, analysis and exports."""

from copy import deepcopy
from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from docx import Document
import pytest

from src.database.document_bank import (
    MunicipalDocumentVersion,
    list_case_documents,
)
from src.services import source_material as material
from src.services import procurement_analysis as analysis
from src.services.dpia_docx import export_dpia_docx
from src.services.dpia_export import export_dpia_xlsx
from src.services.procurement_export import build_procurement_review_docx
from src.services.source_origin import (
    NEEDS_CATEGORY,
    NEEDS_EVIDENCE_TYPE,
    NEEDS_LABEL,
    NEEDS_NOTICE,
    SUPPLIER_NOTICE,
)
from tests.test_dpia_assessment import make_assessment
from tests.test_dpia_source_material import evidence, source_data
from tests.test_procurement_analysis import (
    DRAFT,
    SOURCE,
    setup as analysis_setup,
)
from tests.test_procurement_export import reviewed_case, text_of
from tests.test_source_material import setup as material_setup


@pytest.fixture
def source_setup(tmp_path, monkeypatch):
    yield from material_setup.__wrapped__(tmp_path, monkeypatch)


@pytest.fixture
def procurement_setup(tmp_path, monkeypatch):
    yield from analysis_setup.__wrapped__(tmp_path, monkeypatch)


def test_needs_upload_keeps_case_category_actor_original_and_origin(
    source_setup,
):
    client, factory, (case_id, _), _, _, principal = source_setup
    content = (
        "Kommunen ønsker AI-støtte til interne referater. "
        "Hosting i EU er et krav."
    ).encode()
    response = client.post(
        f"/api/v3/cases/{case_id}/source-material",
        files={"file": ("kommunens-behov.txt", content)},
        data={"category": NEEDS_CATEGORY, "title": "Behov for AI-referater"},
    )
    assert response.status_code == 201, response.text
    saved = response.json()
    for item in [
        saved,
        client.get(f"/api/v3/cases/{case_id}/source-material").json()["items"][
            0
        ],
    ]:
        assert item["category"] == NEEDS_CATEGORY
        assert item["evidence_type"] == NEEDS_EVIDENCE_TYPE
        assert item["evidence_label"] == NEEDS_LABEL
        assert item["review_status"] == "unreviewed"
        assert NEEDS_NOTICE in item["warnings"]
        assert SUPPLIER_NOTICE not in item["warnings"]
    assert client.get(saved["download_url"]).content == content
    with factory() as db:
        link = list_case_documents(db, case_id)[0]
        assert link.document.category == NEEDS_CATEGORY
        assert link.version.uploaded_by == principal.name
        assert link.note == NEEDS_NOTICE
        assert (
            material.case_source_manifest(db, case_id)[0]["category"]
            == NEEDS_CATEGORY
        )
        source = material.case_source_evidence(db, case_id)[0]
        assert source["evidence_type"] == NEEDS_EVIDENCE_TYPE
        assert source["text"] == content.decode()
        assert source["locator"] and source["checksum"]
        assert source["id"] == saved["excerpts"][0]["id"]
        version = db.get(MunicipalDocumentVersion, saved["version_id"])
        version.version_metadata = {
            "source_material": {
                "evidence_type": "supplier_statement",
                "warnings": [SUPPLIER_NOTICE],
                "excerpts": [{"locator": "Fake", "text": "FORGED APPROVAL"}],
            }
        }
        db.commit()
        reread = material.case_source_evidence(db, case_id)[0]
        assert reread == source


def test_supplier_upload_cannot_be_reclassified_by_untrusted_metadata(
    source_setup,
):
    client, factory, (case_id, _), _, _, _ = source_setup
    item = client.post(
        f"/api/v3/cases/{case_id}/source-material",
        files={
            "file": (
                "leverandoer.txt",
                b"Supplier statement requiring review.",
            )
        },
    ).json()
    with factory() as db:
        version = db.get(MunicipalDocumentVersion, item["version_id"])
        version.version_metadata = {
            "source_material": {
                "evidence_type": NEEDS_EVIDENCE_TYPE,
                "category": NEEDS_CATEGORY,
            }
        }
        db.commit()
        assert (
            material.case_source_evidence(db, case_id)[0]["evidence_type"]
            == "supplier_statement"
        )


def test_dpia_sources_use_needs_origin_instead_of_supplier_notice(monkeypatch):
    content = b"The municipality requires deletion after each meeting."
    link = evidence("needs-v1", "behov.txt", content)
    link.document.category = NEEDS_CATEGORY
    sources, warnings, _ = source_data(
        monkeypatch, [link], {"needs-v1": content}
    )
    assert sources[0]["evidence_type"] == NEEDS_EVIDENCE_TYPE
    assert sources[0]["evidence_label"] == NEEDS_LABEL
    assert any(NEEDS_NOTICE in warning for warning in warnings)
    assert not any(SUPPLIER_NOTICE in warning for warning in warnings)


def test_needs_requirements_cannot_become_deployment_facts():
    source = {
        **SOURCE,
        "category": NEEDS_CATEGORY,
        "evidence_type": NEEDS_EVIDENCE_TYPE,
    }
    with pytest.raises(
        analysis.MaterialAnalysisError, match="behovsbeskrivelse"
    ):
        analysis.validate_draft({"sources": [source]}, DRAFT)
    planned = deepcopy(DRAFT)
    planned["facts"][0].update(
        field="purpose",
        value="Planlagt anvendelse: støtte til kommunale møder.",
    )
    assert (
        analysis.validate_draft({"sources": [source]}, planned)["facts"][0][
            "field"
        ]
        == "purpose"
    )
    assert analysis.source_fingerprint(
        [source]
    ) != analysis.source_fingerprint([SOURCE])
    # Additional descriptive provenance leaves legacy supplier hashes stable.
    assert analysis.source_fingerprint(
        [{**SOURCE, "evidence_type": "supplier_statement"}]
    ) == analysis.source_fingerprint([SOURCE])


def test_procurement_word_preserves_municipal_origin(procurement_setup):
    _, _, _, saved, review = reviewed_case(procurement_setup)
    saved["sources"].append(
        {
            **SOURCE,
            "id": "needs:1",
            "document_version_id": "needs-v1",
            "title": "Kommunens plan",
            "category": NEEDS_CATEGORY,
            "evidence_type": NEEDS_EVIDENCE_TYPE,
        }
    )
    text = text_of(build_procurement_review_docx(saved, review))
    assert NEEDS_LABEL in text
    assert NEEDS_NOTICE in text


def test_report_word_and_excel_label_municipal_needs_without_approval():
    request, result = make_assessment()
    result.ai_generation = {
        "model": "openai/gpt-5.5",
        "sources": [
            {
                **SOURCE,
                "category": NEEDS_CATEGORY,
                "evidence_type": NEEDS_EVIDENCE_TYPE,
            },
        ],
    }
    document = Document(BytesIO(export_dpia_docx(request, result)))
    word_text = "\n".join(item.text for item in document.paragraphs)
    assert NEEDS_LABEL in word_text and NEEDS_NOTICE in word_text
    with ZipFile(BytesIO(export_dpia_xlsx(request, result))) as archive:
        sheet = ET.fromstring(archive.read("xl/worksheets/ai-provenance.xml"))
    sheet_text = " ".join(sheet.itertext())
    assert NEEDS_LABEL in sheet_text and NEEDS_NOTICE in sheet_text
