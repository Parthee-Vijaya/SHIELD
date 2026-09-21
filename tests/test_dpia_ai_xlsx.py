from io import BytesIO
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from tests.test_dpia_assessment import make_assessment
from src.services.dpia_export import TEMPLATE_PATH, export_dpia_xlsx


def test_ai_workbook_keeps_template_formulas_and_exports_supplementary_findings():
    request, base = make_assessment()
    result = base.model_copy(
        update={
            "version": 2,
            "additional_risks": [
                {
                    "title": "Syntetisk supplerende risiko",
                    "scenario": "Muligt tab af adgang.",
                    "measures": "Afprøv en manuel reserveprocedure.",
                    "source_ids": ["input:purpose"],
                }
            ],
            "open_questions": ["Hvem afprøver reserveproceduren?"],
            "ai_generation": {
                "model": "openai/gpt-5.5",
                "prompt_version": "test-v1",
                "review": {
                    "model": "typesafe-ai/jev",
                    "rubric_version": "test-v1",
                    "checks": [],
                },
                "sources": [
                    {
                        "id": "input:purpose",
                        "title": "Formål",
                        "text": "=2+2",
                        "sha256": "test-checksum",
                        "source_url": "https://example.invalid/public-dpa",
                        "retrieved_at": "2026-09-20T12:00:00Z",
                        "version": 3,
                    }
                ],
            },
        }
    )
    result.risks[0] = result.risks[0].model_copy(
        update={
            "consequences": "Konkrete skadevirkninger skal undersøges.",
            "rationale": "Manglende testdata gør sandsynligheden usikker.",
            "source_ids": ["input:purpose"],
        }
    )
    payload = export_dpia_xlsx(request, result)
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(BytesIO(payload)) as exported, ZipFile(TEMPLATE_PATH) as original:
        assert exported.testzip() is None
        workbook = ET.fromstring(exported.read("xl/workbook.xml"))
        assert len(workbook.findall("m:sheets/m:sheet", ns)) == 9
        assert (
            workbook.findall("m:sheets/m:sheet", ns)[-1].get("name")
            == "Kilder og kvalitetstjek"
        )
        supplement = ET.fromstring(exported.read("xl/worksheets/ai-provenance.xml"))
        text = " ".join(supplement.itertext())
        assert "Syntetisk supplerende risiko" in text
        assert "Hvem afprøver reserveproceduren?" in text
        assert "test-checksum" in text
        assert "https://example.invalid/public-dpa" in text
        assert "2026-09-20T12:00:00Z" in text
        assert "Manglende testdata gør sandsynligheden usikker." in text
        assert "=2+2" in text
        assert not supplement.findall(".//m:f", ns)
        assert base.id in text
        for part in (
            "xl/worksheets/sheet5.xml",
            "xl/worksheets/sheet7.xml",
        ):
            assert exported.read(part) == original.read(part)
        original_risks = ET.fromstring(original.read("xl/worksheets/sheet6.xml"))
        output_risks = ET.fromstring(exported.read("xl/worksheets/sheet6.xml"))
        assert [cell.text for cell in original_risks.findall(".//m:f", ns)] == [
            cell.text for cell in output_risks.findall(".//m:f", ns)
        ]
        assert (
            "Konkrete skadevirkninger"
            in exported.read("xl/worksheets/sheet6.xml").decode()
        )


def test_workbook_preserves_provided_stakeholder_statements():
    request, result = make_assessment(
        dpo_advice="DPO anbefaler en konkret opfølgende test før stillingtagen.",
        data_subject_consultation="Brugerrepræsentanter ønsker en manuel indsigelseskanal.",
    )
    with ZipFile(BytesIO(export_dpia_xlsx(request, result))) as output:
        sheet = output.read("xl/worksheets/sheet8.xml").decode()
        assert request.dpo_advice in sheet
        assert request.data_subject_consultation in sheet


def test_imported_workbook_discloses_model_and_limitations_without_platform_tags():
    request, result = make_assessment()
    result.ai_generation = {
        "provider": "codex-local-test",
        "model": "gpt-5.6-sol",
        "run_id": "synthetic-codex-run-001",
        "review": {"model": "typesafe-ai/jev", "checks": []},
        "limitations": ["Ingen dokumentbankfiler indgår i denne test."],
    }
    with ZipFile(BytesIO(export_dpia_xlsx(request, result))) as output:
        text = " ".join(ET.fromstring(output.read("xl/worksheets/ai-provenance.xml")).itertext())
        assert "GPT-5.6 Sol" in text
        assert "typesafe-ai/jev" in text
        assert "codex" not in text.lower()
        assert "Ingen dokumentbankfiler indgår i denne test." in text
        assert "openai/gpt-5.5" not in text


def test_generated_workbook_wraps_long_risk_text_and_grows_rows():
    request, result = make_assessment()
    long_text = (
        "Mulig utilsigtet offentliggørelse af oplysninger om medarbejdere. " * 12
    )
    result.risks[0] = result.risks[0].model_copy(
        update={"scenario": long_text, "consequences": long_text}
    )
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(BytesIO(export_dpia_xlsx(request, result))) as output:
        styles = ET.fromstring(output.read("xl/styles.xml")).find("m:cellXfs", ns)
        for part, references in [
            ("sheet6.xml", ["E3", "G3"]),
            ("sheet2.xml", ["A2", "A9"]),
        ]:
            sheet = ET.fromstring(output.read("xl/worksheets/" + part))
            for reference in references:
                cell = sheet.find(f'.//m:c[@r="{reference}"]', ns)
                alignment = styles[int(cell.attrib["s"])].find("m:alignment", ns)
                assert alignment.attrib["wrapText"] in {"1", "true"}
            if part == "sheet6.xml":
                row = sheet.find('.//m:row[@r="3"]', ns)
                assert 200 < float(row.attrib["ht"]) <= 409
                assert long_text in "".join(sheet.itertext())
