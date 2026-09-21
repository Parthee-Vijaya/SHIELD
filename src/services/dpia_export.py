"""Template-faithful XLSX export using targeted OOXML patches.

The template contains Excel extensions which openpyxl does not preserve.  We
therefore replace only individual cell payloads inside the relevant worksheet
XML files. Original styles, validation extensions, conditional formatting,
drawings and formulas are preserved. Wrapped variants of input styles are
appended and filled rows may grow to keep generated text readable.
"""

from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from pathlib import Path, PurePosixPath
import re
import math
import textwrap
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile

from .dpia_assessment import (
    DPIAAssessmentRequest,
    DPIAAssessmentResponse,
    TEMPLATE_VERSION,
    risk_matrix,
)
from .dpia_reading_guide import reading_guide


TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "templates"
    / "dpia"
    / "konsekvensanalyse-ai.xlsx"
)
OFFICIAL_TEMPLATE_SHA256 = (
    "6cbb2fca543426eefca005db9dd2a09516d629e9ef8ef3d5ca7e4583ccef9976"
)

_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
_REQUIRED_SHEETS = frozenset(
    {
        "Introduktion",
        "Resume og scope",
        "Beskrivelse af aktivitet",
        "Vurdering af lovlighed",
        "Evalueringskriterier",
        "Risici",
        "Mitigerende foranstaltninger",
        "Interessentinddragelse",
    }
)

SECTION_ROWS = {
    "1.1": 3,
    "1.2": 5,
    "1.3": 8,
    "1.4": 10,
    "1.5": 12,
    "1.6": 14,
    "1.7": 16,
    "1.8": 19,
    "1.9": 22,
    "2.1": 4,
    "2.2": 6,
    "2.3": 8,
    "2.4": 10,
    "2.5": 12,
    "2.6": 14,
    "2.7": 16,
    "2.8": 18,
    "2.9": 20,
    "2.10": 22,
    "2.11": 25,
    "2.12": 27,
    "2.13": 29,
    "2.14": 31,
    "2.15": 33,
    "2.16": 36,
    "2.17": 38,
    "2.18": 40,
    "2.19": 42,
    "2.20": 45,
    "2.21": 47,
    "2.22": 50,
    "2.23": 52,
    "2.24": 54,
    "2.25": 56,
    "2.26": 58,
    "2.27": 60,
    "2.28": 62,
    "2.29": 65,
    "2.30": 68,
}
RISK_ROWS = {
    **{f"3.{number}": number + 2 for number in range(1, 9)},
    **{f"4.{number}": number + 11 for number in range(1, 9)},
    **{f"5.{number}": number + 20 for number in range(1, 8)},
    **{f"6.{number}": number + 28 for number in range(1, 11)},
}

LIKELIHOOD_LABELS = {
    1: "Usandsynligt (1)",
    2: "Mindre sandsynligt (2)",
    3: "Sandsynligt (3)",
    4: "Forventet (4)",
}
IMPACT_LABELS = {
    1: "Ubetydelig (1)",
    2: "Mindre alvorlig (2)",
    3: "Meget alvorlig (3)",
    4: "Ødelæggende (4)",
}
RISK_LEVEL_LABELS = {
    "low": "Lav",
    "medium": "Mellem",
    "high": "Høj",
    "very_high": "Meget høj",
}
APPROVAL_TYPE_LABELS = {
    "case": "Sag",
    "dpia": "Konsekvensanalyse",
    "ai_act": "AI-forordningen",
    "fria": "Grundlæggende rettigheder",
    "deployment": "Idriftsættelse",
}


class TemplateError(RuntimeError):
    """Raised when the bundled workbook is missing or structurally invalid."""


def _normalise_target(target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return str(PurePosixPath("xl") / target)


def _sheet_paths(workbook: ZipFile) -> dict[str, str]:
    namespace = {"m": _MAIN_NS, "r": _REL_NS, "p": _PKG_REL_NS}
    workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
    relationships = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: _normalise_target(relation.attrib["Target"])
        for relation in relationships.findall("p:Relationship", namespace)
    }
    paths: dict[str, str] = {}
    for sheet in workbook_xml.findall("m:sheets/m:sheet", namespace):
        relationship_id = sheet.attrib[f"{{{_REL_NS}}}id"]
        paths[sheet.attrib["name"]] = targets[relationship_id]
    return paths


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as template_file:
        for chunk in iter(lambda: template_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _worksheet_cells(workbook: ZipFile, path: str) -> dict[str, ET.Element]:
    worksheet = ET.fromstring(workbook.read(path))
    return {
        cell.attrib["r"]: cell
        for cell in worksheet.findall(f".//{{{_MAIN_NS}}}c")
        if "r" in cell.attrib
    }


def _required_cells() -> dict[str, set[str]]:
    risk_rows = set(RISK_ROWS.values())
    return {
        "Introduktion": {"B3"},
        "Resume og scope": {"A2", "A9"},
        "Beskrivelse af aktivitet": {
            f"I{row}"
            for section_id, row in SECTION_ROWS.items()
            if section_id.startswith("1.")
        },
        "Vurdering af lovlighed": {
            f"I{row}"
            for section_id, row in SECTION_ROWS.items()
            if section_id.startswith("2.")
        },
        "Evalueringskriterier": {
            *(f"Q{row}" for row in range(5, 9)),
            *(f"{column}{row}" for column in "RSTU" for row in range(5, 10)),
        },
        "Risici": {f"{column}{row}" for row in risk_rows for column in "EFGHIJKLMNOP"},
        "Interessentinddragelse": {"I2", "I4", "I6", "I9", "I12"},
    }


def _expected_risk_formula(reference: str) -> str:
    column, row = reference[0], reference[1:]
    if column == "I":
        likelihood_column, impact_column = "F", "H"
    elif column == "M":
        likelihood_column, impact_column = "K", "L"
    else:  # pragma: no cover - internal programming error
        raise ValueError(f"Ukendt risikokolonne: {column}")
    return (
        "INDEX(Evalueringskriterier!$R$5:$U$8,"
        f"MATCH({impact_column}{row},Evalueringskriterier!$Q$5:$Q$8,0),"
        f"MATCH({likelihood_column}{row},Evalueringskriterier!$R$9:$U$9,0))"
    )


def _validate_template_structure(workbook: ZipFile, sheets: dict[str, str]) -> None:
    missing_sheets = sorted(_REQUIRED_SHEETS.difference(sheets))
    if missing_sheets:
        raise TemplateError("DPIA-skabelonen mangler ark: " + ", ".join(missing_sheets))

    workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
    if workbook_xml.find(f"{{{_MAIN_NS}}}calcPr") is None:
        raise TemplateError("DPIA-skabelonen mangler workbook calcPr")

    cells_by_sheet: dict[str, dict[str, ET.Element]] = {}
    for sheet_name, expected_cells in _required_cells().items():
        cells = _worksheet_cells(workbook, sheets[sheet_name])
        cells_by_sheet[sheet_name] = cells
        missing_cells = sorted(expected_cells.difference(cells))
        if missing_cells:
            raise TemplateError(
                f"DPIA-skabelonen mangler celler i {sheet_name}: "
                + ", ".join(missing_cells)
            )

    risk_cells = cells_by_sheet["Risici"]
    for row in RISK_ROWS.values():
        for column in ("I", "M"):
            reference = f"{column}{row}"
            formula = risk_cells[reference].findtext(f"{{{_MAIN_NS}}}f")
            if formula != _expected_risk_formula(reference):
                raise TemplateError(
                    f"DPIA-skabelonen har en ukendt eller ændret formel i {reference}"
                )


def template_readiness(template_path: Path = TEMPLATE_PATH) -> tuple[bool, str]:
    """Validate the exact approved workbook and its critical OOXML contract."""

    if not template_path.is_file():
        return False, f"DPIA-skabelonen findes ikke: {template_path}"
    try:
        if not TEMPLATE_VERSION.endswith(OFFICIAL_TEMPLATE_SHA256[:12]):
            return (
                False,
                "DPIA-skabelonversionen og den godkendte SHA256 er inkonsistente",
            )
        actual_sha256 = _file_sha256(template_path)
        if actual_sha256 != OFFICIAL_TEMPLATE_SHA256:
            return (
                False,
                "DPIA-skabelonens SHA256 matcher ikke den godkendte version "
                f"(forventet {OFFICIAL_TEMPLATE_SHA256}, fundet {actual_sha256})",
            )
        with ZipFile(template_path, "r") as workbook:
            bad_entry = workbook.testzip()
            if bad_entry:
                return False, f"DPIA-skabelonen har en korrupt del: {bad_entry}"
            sheets = _sheet_paths(workbook)
            _validate_template_structure(workbook, sheets)
    except TemplateError as exc:
        return False, str(exc)
    except (BadZipFile, KeyError, ET.ParseError, OSError) as exc:
        return False, f"DPIA-skabelonen kan ikke læses: {exc}"
    return True, "ok"


def _is_xml_10_character(character: str) -> bool:
    codepoint = ord(character)
    return (
        codepoint in {0x09, 0x0A, 0x0D}
        or 0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def _safe_xml_text(value: object) -> str:
    cleaned = "".join(
        character for character in str(value) if _is_xml_10_character(character)
    )
    return escape(cleaned, {'"': "&quot;"})


def _inline_opening(opening: str) -> str:
    # Preserve style and every other cell attribute, replacing only the value
    # type. inlineStr means values beginning =,+,-,@ remain literal text.
    opening = re.sub(r'\s+t="[^"]*"', "", opening)
    return opening[:-1] + ' t="inlineStr">'


def _patch_cell(sheet_xml: bytes, reference: str, value: object) -> bytes:
    text = sheet_xml.decode("utf-8")
    ref = re.escape(reference)
    content = f'<is><t xml:space="preserve">{_safe_xml_text(value)}</t></is>'

    # Match self-closing cells first.  Otherwise a generic ``<c ...>.*?</c>``
    # expression can start on ``<c .../>`` and consume the following cell.
    empty_cell = re.compile(rf'<c\b(?=[^>]*\br="{ref}")(?P<attrs>[^>]*)/>')
    match = empty_cell.search(text)
    if match:
        opening = "<c" + match.group("attrs") + ">"
        replacement = _inline_opening(opening) + content + "</c>"
        return (text[: match.start()] + replacement + text[match.end() :]).encode(
            "utf-8"
        )

    full_cell = re.compile(
        rf'(?P<open><c\b(?=[^>]*\br="{ref}")[^>]*(?<!/)>).*?</c>',
        flags=re.DOTALL,
    )
    match = full_cell.search(text)
    if match:
        replacement = _inline_opening(match.group("open")) + content + "</c>"
        return (text[: match.start()] + replacement + text[match.end() :]).encode(
            "utf-8"
        )

    raise TemplateError(f"Forventet celle {reference} findes ikke i DPIA-skabelonen")


def _patch_cells(sheet_xml: bytes, values: dict[str, object]) -> bytes:
    patched = sheet_xml
    for reference, value in values.items():
        if value is not None:
            patched = _patch_cell(patched, reference, value)
    return patched


def _readable_text_layout(
    sheets: dict[str, bytes],
    values_by_path: dict[str, dict[str, object]],
    styles_xml: bytes,
) -> tuple[dict[str, bytes], bytes]:
    """Wrap populated cells without reserializing Excel's extension markup.

    Excel cannot auto-fit merged cells. Estimate conservative row heights from
    their combined column widths, preserving the template's minimum heights.
    Excel's 409 point row limit still applies; full cell values are retained.
    """
    styles_text = styles_xml.decode("utf-8")
    styles_match = re.search(
        r"(<cellXfs\b[^>]*>)(.*?)(</cellXfs>)", styles_text, re.DOTALL
    )
    if not styles_match:
        raise TemplateError("DPIA-skabelonen mangler cellestile")
    originals = re.findall(
        r"<xf\b[^>]*?/>|<xf\b[^>]*>.*?</xf>", styles_match.group(2), re.DOTALL
    )
    additions: list[str] = []
    wrapped: dict[int, int] = {}

    def wrapped_style(index: int) -> int:
        if index in wrapped:
            return wrapped[index]
        original = originals[index]
        alignment = re.search(r"<alignment\b[^>]*/>", original)
        if alignment and re.search(r'wrapText="(?:1|true)"', alignment.group()):
            wrapped[index] = index
            return index
        new_alignment = alignment.group() if alignment else "<alignment/>"
        new_alignment = re.sub(r'\s+(?:wrapText|vertical)="[^"]*"', "", new_alignment)
        new_alignment = new_alignment[:-2] + ' wrapText="1" vertical="top"/>'
        clone = re.sub(r'\s+applyAlignment="[^"]*"', "", original)
        clone = clone.replace("<xf ", '<xf applyAlignment="1" ', 1)
        if alignment:
            clone = re.sub(r"<alignment\b[^>]*/>", lambda _: new_alignment, clone)
        elif clone.endswith("/>"):
            clone = clone[:-2] + ">" + new_alignment + "</xf>"
        else:
            clone = clone.replace("</xf>", new_alignment + "</xf>")
        wrapped[index] = len(originals) + len(additions)
        additions.append(clone)
        return wrapped[index]

    def coordinate(reference: str) -> tuple[int, int]:
        match = re.fullmatch(r"([A-Z]+)(\d+)", reference)
        if not match:
            raise TemplateError("Ugyldig cellereference i skabelon")
        column = 0
        for letter in match[1]:
            column = column * 26 + ord(letter) - 64
        return column, int(match[2])

    output = {}
    for path, sheet in sheets.items():
        root = ET.fromstring(sheet)
        cells = {c.attrib["r"]: c for c in root.findall(f".//{{{_MAIN_NS}}}c")}
        columns = root.findall(f"{{{_MAIN_NS}}}cols/{{{_MAIN_NS}}}col")
        merges = [
            (
                coordinate(m.attrib["ref"].split(":")[0]),
                coordinate(m.attrib["ref"].split(":")[-1]),
            )
            for m in root.findall(f"{{{_MAIN_NS}}}mergeCells/{{{_MAIN_NS}}}mergeCell")
        ]
        row_heights = {
            int(row.attrib["r"]): float(row.attrib.get("ht", "15"))
            for row in root.findall(f"{{{_MAIN_NS}}}sheetData/{{{_MAIN_NS}}}row")
        }
        new_heights: dict[int, float] = {}
        xml = sheet.decode("utf-8")
        for reference, value in values_by_path[path].items():
            if value is None or not str(value):
                continue
            cell = cells[reference]
            style = wrapped_style(int(cell.attrib.get("s", "0")))
            pattern = rf'<c\b(?=[^>]*\br="{re.escape(reference)}")[^>]*>'

            def change_style(match: re.Match[str]) -> str:
                opening = re.sub(r'\s+s="[^"]*"', "", match.group())
                return opening[:-1] + f' s="{style}">'

            xml = re.sub(pattern, change_style, xml, count=1)
            start_column, start_row = coordinate(reference)
            end_column, end_row = start_column, start_row
            for start, end in merges:
                if start == (start_column, start_row):
                    end_column, end_row = end
                    break
            width = 0.0
            for column in range(start_column, end_column + 1):
                dimension = next(
                    (
                        c
                        for c in columns
                        if int(c.attrib["min"]) <= column <= int(c.attrib["max"])
                    ),
                    None,
                )
                width += (
                    float(dimension.attrib.get("width", "9"))
                    if dimension is not None
                    else 9.0
                )
            line_width = max(5, math.floor(width * 0.85))
            lines = sum(
                max(1, len(textwrap.wrap(line, width=line_width)))
                for line in str(value).split("\n")
            )
            required = lines * 16 + 12
            per_row = min(409.0, required / (end_row - start_row + 1))
            for row in range(start_row, end_row + 1):
                new_heights[row] = max(
                    new_heights.get(row, 0), row_heights.get(row, 15), per_row
                )
        for row, height in new_heights.items():

            def change_height(match: re.Match[str]) -> str:
                opening = re.sub(r'\s+(?:ht|customHeight)="[^"]*"', "", match.group())
                return opening[:-1] + f' ht="{height:.2f}" customHeight="1">'

            xml = re.sub(
                rf'<row\b(?=[^>]*\br="{row}")[^>]*>', change_height, xml, count=1
            )
        output[path] = xml.encode("utf-8")
    if additions:
        opening = re.sub(
            r'count="\d+"',
            f'count="{len(originals) + len(additions)}"',
            styles_match.group(1),
        )
        replacement = (
            opening + styles_match.group(2) + "".join(additions) + styles_match.group(3)
        )
        styles_text = (
            styles_text[: styles_match.start()]
            + replacement
            + styles_text[styles_match.end() :]
        )
    return output, styles_text.encode("utf-8")


def _patch_formula_cache(sheet_xml: bytes, reference: str, value: str) -> bytes:
    """Update a formula's cached value while preserving formula and style."""

    text = sheet_xml.decode("utf-8")
    ref = re.escape(reference)
    pattern = re.compile(
        rf'(?P<open><c\b(?=[^>]*\br="{ref}")[^>]*>)(?P<body>.*?)(?P<close></c>)',
        flags=re.DOTALL,
    )
    match = pattern.search(text)
    if not match or "<f" not in match.group("body"):
        raise TemplateError(
            f"Forventet formelcelle {reference} findes ikke i DPIA-skabelonen"
        )
    body = match.group("body")
    cached = f"<v>{_safe_xml_text(value)}</v>"
    if re.search(r"<v>.*?</v>", body, flags=re.DOTALL):
        body = re.sub(r"<v>.*?</v>", cached, body, count=1, flags=re.DOTALL)
    else:
        body += cached
    replacement = match.group("open") + body + match.group("close")
    return (text[: match.start()] + replacement + text[match.end() :]).encode("utf-8")


def _enable_formula_recalculation(workbook_xml: bytes) -> bytes:
    text = workbook_xml.decode("utf-8")
    pattern = re.compile(r"<calcPr\b(?P<attrs>[^>]*)/>")
    match = pattern.search(text)
    if not match:
        raise TemplateError("DPIA-skabelonen mangler workbook calcPr")
    attrs = match.group("attrs")
    for name in ("fullCalcOnLoad", "forceFullCalc", "calcMode"):
        attrs = re.sub(rf'\s+{name}="[^"]*"', "", attrs)
    replacement = (
        f'<calcPr{attrs} fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/>'
    )
    return (text[: match.start()] + replacement + text[match.end() :]).encode("utf-8")


def _validate_snapshot_contract(result: DPIAAssessmentResponse) -> None:
    if result.template_version != TEMPLATE_VERSION:
        raise TemplateError(
            "DPIA-snapshot bruger skabelonversion "
            f"{result.template_version!r}, men denne installation understøtter kun "
            f"{TEMPLATE_VERSION!r}. Eksportér snapshot'et med den oprindelige version."
        )

    section_ids = [section.id for section in result.sections]
    expected_section_ids = list(SECTION_ROWS)
    if len(section_ids) != len(set(section_ids)) or set(section_ids) != set(
        expected_section_ids
    ):
        raise TemplateError(
            "DPIA-snapshot har en inkompatibel sektionskontrakt og kan ikke "
            "eksporteres med denne skabelonversion."
        )

    risk_ids = [risk.id for risk in result.risks]
    expected_risk_ids = list(RISK_ROWS)
    if len(risk_ids) != len(set(risk_ids)) or set(risk_ids) != set(expected_risk_ids):
        raise TemplateError(
            "DPIA-snapshot har en inkompatibel risikokontrakt og kan ikke "
            "eksporteres med denne skabelonversion."
        )

    for risk in result.risks:
        expected_inherent = risk_matrix(risk.likelihood, risk.impact)
        expected_residual = risk_matrix(
            risk.residual_likelihood,
            risk.residual_impact,
        )
        if (
            risk.inherent_risk != expected_inherent
            or risk.residual_risk != expected_residual
        ):
            raise TemplateError(
                f"DPIA-snapshot har en inkonsistent risikomatrix for risiko {risk.id}."
            )


def _editorial_target_label(target: str) -> str:
    if target == "summary":
        return "Resumé"
    if target == "scope":
        return "Afgrænsning"
    if target.startswith("section:"):
        return f"Afsnit {target.split(':', 1)[1]}"
    if target.startswith("risk:"):
        return f"Risiko {target.split(':', 1)[1]}"
    return target


def _editorial_change_label(change: dict) -> str:
    target = _editorial_target_label(change.get("target", ""))
    field = {
        "text": "Tekst",
        "executive_summary": "Resumé",
        "scope": "Afgrænsning",
        "scenario": "Risikoscenarie",
        "measures": "Foranstaltninger",
        "rationale": "Begrundelse",
        "consequences": "Konsekvenser",
    }.get(change.get("field", ""), "Tekst")
    return target if target == field else f"{target} · {field}"


def _editorial_review_note(result: DPIAAssessmentResponse) -> str:
    checks = ((result.ai_generation or {}).get("review") or {}).get("checks")
    if isinstance(checks, list) and checks:
        return "Den tidligere JEV-kontrol dækker ikke de ændrede tekster."
    return "Den redigerede tekst er ikke kontrolleret med JEV."


def _approval_text(guide: dict) -> str:
    approval = guide.get("approval", {})
    lines = [approval.get("label", "Godkendelse fremgår ikke af denne rapportversion")]
    for item in approval.get("items", []):
        lines.extend(
            [
                "Beslutningstype: "
                + APPROVAL_TYPE_LABELS.get(item.get("approval_type"), "Ikke angivet"),
                "Besluttet af: " + str(item.get("decided_by") or "Ikke angivet"),
                "Beslutningsdato: " + str(item.get("decided_at") or "Ikke angivet"),
            ]
        )
        for key, label in (("reason", "Begrundelse"), ("conditions", "Vilkår")):
            if item.get(key):
                value = item[key]
                lines.append(
                    label
                    + ": "
                    + ("\n".join(value) if isinstance(value, list) else str(value))
                )
        if item.get("is_identity_verified") is not True:
            lines.append(
                "Beslutningens identitet er ikke verificeret og skal bekræftes før den lægges til grund."
            )
    return "\n".join(lines)


def _worksheet_updates(
    request: DPIAAssessmentRequest,
    result: DPIAAssessmentResponse,
) -> dict[str, dict[str, object]]:
    sections = {section.id: section for section in result.sections}
    ai = getattr(result, "ai_generation", None) or {}
    guide = getattr(result, "reading_guide", None) or reading_guide(request, result)

    def section_text(section_id: str) -> str:
        section = sections[section_id]
        source_ids = getattr(section, "source_ids", [])
        return section.text + (
            "\n\nKilder: " + ", ".join(source_ids) if source_ids else ""
        )

    activity: dict[str, object] = {
        f"I{row}": section_text(section_id)
        for section_id, row in SECTION_ROWS.items()
        if section_id.startswith("1.")
    }
    lawfulness: dict[str, object] = {
        f"I{row}": section_text(section_id)
        for section_id, row in SECTION_ROWS.items()
        if section_id.startswith("2.")
    }
    risk_values: dict[str, object] = {}
    for risk in result.risks:
        row = RISK_ROWS[risk.id]
        # I and M keep the template's canonical formulas. Their cached values
        # are updated separately, and Excel is instructed to recalculate them.
        risk_values.update(
            {
                f"E{row}": (
                    "Hvad kan ske?\n"
                    + risk.scenario
                    + "\n\nHvorfor er dette en risiko?\n"
                    + (
                        getattr(risk, "rationale", "")
                        or "En særskilt begrundelse er ikke dokumenteret i denne vurderingsversion; skal afklares fagligt."
                    )
                ),
                f"F{row}": LIKELIHOOD_LABELS[risk.likelihood],
                f"G{row}": getattr(risk, "consequences", "")
                or "Kan påvirke de registreredes rettigheder og frihedsrettigheder; den konkrete konsekvens skal valideres fagligt.",
                f"H{row}": IMPACT_LABELS[risk.impact],
                f"J{row}": (
                    "Mitigerende forslag og oplyste foranstaltninger\n"
                    + risk.measures
                    + "\n\nForslag er ikke dokumentation for gennemførelse. Effekten skal verificeres før en ny risikovurdering."
                ),
                f"K{row}": LIKELIHOOD_LABELS[risk.residual_likelihood],
                f"L{row}": IMPACT_LABELS[risk.residual_impact],
                f"N{row}": risk.owner,
                f"O{row}": "Ikke påbegyndt – kræver verificering",
                # P is left untouched until an actual due date is assigned.
            }
        )
    dpo_text = ("DPO/databeskyttelsesrådgiverens inddragelse er ikke dokumenteret og skal afklares. " + request.dpo_advice) if request.dpo_involved is None else request.dpo_advice or (
        "DPO er oplyst som inddraget. DPO's konkrete synspunkter og eventuelle forbehold skal indsættes og godkendes manuelt."
        if request.dpo_involved
        else "Mangler oplysninger: DPO er ikke oplyst som inddraget; synspunkter skal indhentes og dokumenteres."
    )
    stakeholder_values: dict[str, object] = {
        "I2": dpo_text,
        "I4": request.data_subject_consultation
        or "Mangler oplysninger: registreredes eller repræsentanters synspunkter er ikke dokumenteret; alternativt skal begrundelsen for fravalg angives.",
        "I6": (
            "Screeningen indeholder meget høj resterende risiko. Vurder efter færdiggørelse af foranstaltninger, om forudgående høring efter artikel 36 er nødvendig."
            if result.risk_level == "very_high"
            else "Forudgående høring er ikke vurderet i dette udkast; vurderingen skal gentages efter godkendelse af resterende risici."
        ),
        "I9": _approval_text(guide)
        + "\nBeslutningens type og vilkår skal kontrolleres. Vurderingsstatus er ikke i sig selv en ledelsesgodkendelse eller accept af resterende risiko.",
        "I12": f"{request.owner} (oplyst faglig/organisatorisk ejer). Rolle, revisionsinterval og stedfortræder skal bekræftes.",
    }
    return {
        "Introduktion": {
            "B3": (
                f"DPIA-udkast for {request.project_name}, {request.organisation}. "
                f"Version {getattr(result, 'version', 1)} · {result.id}. "
                + (
                    "Fagligt redigeret. "
                    + _editorial_review_note(result)
                    + " Se arket 'Kilder og kvalitetstjek'. "
                    if result.editorial_revision
                    else (
                        "Udarbejdet med AI; se arket 'Kilder og kvalitetstjek'. "
                        if ai
                        else "Genereret deterministisk. "
                    )
                )
                + "Kræver faglig og juridisk gennemgang."
            ),
        },
        "Resume og scope": {"A2": result.executive_summary, "A9": result.scope},
        "Beskrivelse af aktivitet": activity,
        "Vurdering af lovlighed": lawfulness,
        "Risici": risk_values,
        "Interessentinddragelse": stakeholder_values,
    }


def _ai_supplement(
    request: DPIAAssessmentRequest, result: DPIAAssessmentResponse, style: str
) -> bytes:
    """Keep the reading guide, proposals and provenance outside official scores."""
    ai = getattr(result, "ai_generation", None) or {}
    guide = getattr(result, "reading_guide", None) or reading_guide(request, result)
    editorial = result.editorial_revision or {}
    stale_checks = set(editorial.get("stale_check_ids", []))
    rows = [
        ("Beslutningsoversigt", request.project_name),
        ("Konklusion", guide.get("conclusion") or result.status_label),
        ("Godkendelse", _approval_text(guide)),
        ("Samlet resterende risiko", RISK_LEVEL_LABELS[result.risk_level]),
    ]
    for label, key, fallback in (
        ("Blokerer en godkendelse", "blockers", result.blockers),
        (
            "Skal afklares eller dokumenteres",
            "missing_information",
            result.missing_information,
        ),
        ("Åbent spørgsmål", "open_questions", []),
        ("Næste skridt mod stillingtagen", "next_steps", result.next_steps),
    ):
        rows.extend((label, value) for value in guide.get(key, fallback))
    for control in guide.get("documented_controls", []):
        rows.append(
            ("Kontrol med registreret evidens – ikke en godkendelse", control["title"])
        )
        rows.append(("Registreret evidens", control["evidence"]))
    rows.append(
        (
            "Anbefalinger – forslag til faglig drøftelse",
            "Forslagene er adskilt fra vurderingen. De dokumenterer ikke gennemførte foranstaltninger, godkendelse eller lavere risiko. Eventuelle ændringer skal besluttes, gennemføres og verificeres før en ny vurdering.",
        )
    )
    rows.append(
        (
            "Anbefalingernes grundlag",
            (
                "Gemte forslag i denne vurderingsversion."
                if guide.get("recommendation_origin") == "saved"
                else "Regelbaserede forslag ud fra sagens oplysninger. De er en læsehjælp og indgår ikke i det historiske AI-udkast eller dets JEV-kontrol."
            ),
        )
    )
    for recommendation in guide.get("recommendations", []):
        for key, label in (
            ("title", "Anbefaling"),
            ("proposal", "Anbefalet mulighed"),
            ("rationale", "Hvorfor kan forslaget være relevant?"),
            ("prerequisites", "Forudsætninger før et valg"),
            ("verification", "Sådan efterprøves forslaget"),
            ("source_ids", "Kilder til anbefalingen"),
        ):
            value = recommendation.get(key)
            if value:
                rows.append(
                    (label, "\n".join(value) if isinstance(value, list) else value)
                )
    if not guide.get("recommendations"):
        rows.append(
            (
                "Anbefalinger",
                "Der er ikke registreret særskilte anbefalinger i denne vurderingsversion.",
            )
        )
    rows += [
        ("Vurdering", result.id),
        ("Version", getattr(result, "version", 1)),
        ("Oprettet", result.created_at.isoformat()),
        ("Skabelon", result.template_version),
        ("Skrivemodel", ai.get("model", "")),
        ("Promptversion", ai.get("prompt_version", "")),
        ("Evalueringsmodel", ai.get("review", {}).get("model", "")),
        ("Evalueringskriterier", ai.get("review", {}).get("rubric_version", "")),
        (
            "Faglig status",
            "Vurderingen kræver faglig stillingtagen. AI-kvalitetstjek er ikke juridisk godkendelse.",
        ),
    ]
    if editorial:
        rows.extend(
            [
                ("Fagligt redigeret rapportversion", editorial.get("edited_at", "")),
                ("Redigeret af", editorial.get("edited_by", "")),
                ("Begrundelse", editorial.get("note", "")),
                ("Forrige version", editorial.get("base_assessment_id", "")),
                (
                    "Ændrede afsnit",
                    ", ".join(
                        _editorial_target_label(target)
                        for target in editorial.get("changed_targets", [])
                    ),
                ),
                (
                    "Kvalitetstjek af ændret tekst",
                    _editorial_review_note(result)
                    + " Risikoscorer, blokeringer, sagsoplysninger og hjemmelskontrol er uændrede; versionen er ikke en juridisk godkendelse.",
                ),
            ]
        )
        for change in editorial.get("changes", []):
            rows.extend(
                [
                    ("Ændring", _editorial_change_label(change)),
                    ("Tidligere tekst", change.get("before", {}).get("text", "")),
                    ("Ny tekst", change.get("after", {}).get("text", "")),
                    (
                        "Tidligere kildehenvisninger",
                        ", ".join(change.get("before", {}).get("source_ids", [])),
                    ),
                    (
                        "Nye kildehenvisninger",
                        ", ".join(change.get("after", {}).get("source_ids", [])),
                    ),
                ]
            )
    if ai.get("provider") in {"codex-local-test", "codex-local"}:
        is_test = ai.get("provider") == "codex-local-test"
        rows.append(
            (
                "Udarbejdet i",
                "Codex – lokal testkørsel" if is_test else "Codex – lokal kørsel",
            )
        )
        if ai.get("run_id"):
            rows.append(("Testkørsel" if is_test else "Kørsels-ID", ai["run_id"]))
        if ai.get("model_run_provenance") == "operator_reported":
            rows.append(
                (
                    "Oplysning om model og kørsel",
                    "Model og kørsels-ID er oplyst af den lokale operatør ved importen.",
                )
            )
    limitations = ai.get("limitations", [])
    if isinstance(limitations, str):
        limitations = [limitations]
    if isinstance(limitations, list):
        rows.extend(("Begrænsning ved AI-udkastet", value) for value in limitations)
    for check in ai.get("review", {}).get("checks", []):
        rows.append(
            (
                check.get("label", check.get("id", "Kontrol")),
                (
                    "Tidligere JEV-kontrol — teksten er ændret og kræver nyt kvalitetstjek"
                    if check.get("id") in stale_checks
                    or set(check.get("section_ids", [])).intersection(stale_checks)
                    else (
                        "Markeret til gennemgang"
                        if check.get("requires_review")
                        else "Ingen markering fra JEV; faglig gennemgang kræves stadig"
                    )
                ),
            )
        )
    for question in getattr(result, "open_questions", []) or ai.get(
        "open_questions", []
    ):
        rows.append(("Åbent spørgsmål", question))
    for risk in getattr(result, "additional_risks", []) or ai.get(
        "additional_risks", []
    ):
        rows.extend(
            [
                ("Yderligere risikoforslag", risk.get("title", "")),
                ("Scenarie", risk.get("scenario", "")),
                ("Foreslåede foranstaltninger", risk.get("measures", "")),
                ("Kilder", ", ".join(risk.get("source_ids", []))),
            ]
        )
    for risk in result.risks:
        if getattr(risk, "rationale", ""):
            rows.append((f"Begrundelse for risiko {risk.id}", risk.rationale))
        if getattr(risk, "source_ids", []):
            rows.append((f"Kilder til risiko {risk.id}", ", ".join(risk.source_ids)))
    for source in ai.get("sources", []):
        rows.extend(
            [
                (source.get("id", "Kilde"), source.get("title", "")),
                ("Kildeindhold", source.get("text", "")),
                ("Offentlig kilde", source.get("source_url", "")),
                ("Hentet", source.get("retrieved_at", "")),
                ("Dokumentversion", source.get("version", "")),
                ("Kontrolsum", source.get("sha256", source.get("checksum", ""))),
            ]
        )
    content = []
    bounded_rows = []
    for label, value in rows:
        text = str(value)
        # A cell is limited to 32,767 UTF-16 units. Preserve long sources in
        # consecutive rows; 12k Unicode code points also fits astral characters.
        for start in range(0, max(1, len(text)), 12_000):
            bounded_rows.append(
                (
                    label if start == 0 else f"{label} (fortsat)",
                    text[start : start + 12_000],
                )
            )
    for number, (label, value) in enumerate(bounded_rows, start=1):
        cells = "".join(
            f'<c r="{column}{number}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{_safe_xml_text(text)}</t></is></c>'
            for column, text in (("A", label), ("B", value))
        )
        line_count = max(
            sum(
                max(1, len(textwrap.wrap(line, width=width)))
                for line in str(text).split("\n")
            )
            for text, width in ((label, 28), (value, 94))
        )
        height = min(409, max(28, line_count * 15 + 12))
        content.append(
            f'<row r="{number}" ht="{height}" customHeight="1">{cells}</row>'
        )
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{_MAIN_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="32" customWidth="1"/>'
        '<col min="2" max="2" width="110" customWidth="1"/></cols><sheetData>'
        + "".join(content)
        + "</sheetData></worksheet>"
    ).encode("utf-8")


def export_dpia_xlsx(
    request: DPIAAssessmentRequest,
    result: DPIAAssessmentResponse,
    *,
    template_path: Path = TEMPLATE_PATH,
) -> bytes:
    """Return a populated workbook while preserving the template structure."""

    _validate_snapshot_contract(result)
    ready, detail = template_readiness(template_path)
    if not ready:
        raise TemplateError(detail)
    updates = _worksheet_updates(request, result)
    formula_cache_updates = {
        reference: value
        for risk in result.risks
        for reference, value in (
            (
                f"I{RISK_ROWS[risk.id]}",
                RISK_LEVEL_LABELS[risk_matrix(risk.likelihood, risk.impact)],
            ),
            (
                f"M{RISK_ROWS[risk.id]}",
                RISK_LEVEL_LABELS[
                    risk_matrix(risk.residual_likelihood, risk.residual_impact)
                ],
            ),
        )
    }
    destination = BytesIO()
    with ZipFile(template_path, "r") as source:
        paths = _sheet_paths(source)
        # The reading guide is also useful for historical rule-based reports.
        # It is an extra sheet; the eight official template sheets stay intact.
        supplement_path = "xl/worksheets/ai-provenance.xml"
        supplement_relation = "rIdShieldAiProvenance"
        workbook_root = ET.fromstring(source.read("xl/workbook.xml"))
        next_sheet_id = (
            max(
                int(sheet.attrib["sheetId"])
                for sheet in workbook_root.findall(
                    f"{{{_MAIN_NS}}}sheets/{{{_MAIN_NS}}}sheet"
                )
            )
            + 1
        )
        style = _worksheet_cells(source, paths["Risici"])["J3"].attrib.get("s", "0")
        updates_by_path = {paths[name]: values for name, values in updates.items()}
        populated = {
            path: _patch_cells(source.read(path), values)
            for path, values in updates_by_path.items()
        }
        populated, readable_styles = _readable_text_layout(
            populated, updates_by_path, source.read("xl/styles.xml")
        )
        with ZipFile(
            destination, "w", compression=ZIP_DEFLATED, allowZip64=True
        ) as target:
            for entry in source.infolist():
                payload = source.read(entry.filename)
                if entry.filename in populated:
                    payload = populated[entry.filename]
                if entry.filename == "xl/styles.xml":
                    payload = readable_styles
                if entry.filename == paths["Risici"]:
                    for reference, value in formula_cache_updates.items():
                        payload = _patch_formula_cache(payload, reference, value)
                if entry.filename == "xl/workbook.xml":
                    payload = _enable_formula_recalculation(payload)
                    payload = payload.replace(
                        b"</sheets>",
                        f'<sheet name="Kilder og kvalitetstjek" sheetId="{next_sheet_id}" r:id="{supplement_relation}"/></sheets>'.encode(),
                    )
                if entry.filename == "xl/_rels/workbook.xml.rels":
                    payload = payload.replace(
                        b"</Relationships>",
                        f'<Relationship Id="{supplement_relation}" Type="{_REL_NS}/worksheet" Target="worksheets/ai-provenance.xml"/></Relationships>'.encode(),
                    )
                if entry.filename == "[Content_Types].xml":
                    payload = payload.replace(
                        b"</Types>",
                        b'<Override PartName="/xl/worksheets/ai-provenance.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
                    )
                # Supplying the original ZipInfo preserves timestamp, flags,
                # attributes, comments and the original compression method.
                target.writestr(entry, payload)
            target.writestr(supplement_path, _ai_supplement(request, result, style))
    return destination.getvalue()
