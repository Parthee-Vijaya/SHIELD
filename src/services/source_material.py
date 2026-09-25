"""Case-pinned evidence with bounded text extraction and exact locators.

Municipal needs and supplier statements remain distinct, never legal approval. Documents
and web snapshots keep their original checksum and version; no AI is called.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from src.services.source_origin import (
    SUPPLIER_NOTICE,
    source_classification,
    source_warnings,
)

from src.services.analysis_limits import (
    MAX_DOCUMENT_TEXT_CHARS,
    MAX_EXTRACTION_TEXT_CHARS,
    MAX_EXTRACTION_SEGMENTS,
    danish_number,
)

from src.database.cases import get_case
from src.database.document_bank import (
    DOCUMENT_CATEGORIES,
    MunicipalDocumentVersion,
    add_document_version,
    create_document,
    link_document_to_case,
    list_case_documents,
)
from src.services.document_bank_storage import (
    delete_document_bytes,
    read_document_bytes,
    safe_office_xml,
    store_document_bytes,
    validate_office_package,
)
from src.services.safe_public_fetch import (
    MAX_SOURCE_BYTES,
    PublicSource,
    fetch_public_source,
)


MAX_TEXT_CHARS = MAX_EXTRACTION_TEXT_CHARS
MAX_SEGMENTS = MAX_EXTRACTION_SEGMENTS
HTML_BLOCK_CHARS = 2_000
SOURCE_EXTENSIONS = {".pptx", ".docx", ".pdf", ".txt"}
EXTRACTION_VERSION = "municipal-sources-3"
_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


@dataclass(frozen=True)
class Extraction:
    excerpts: list[dict[str, str]]
    warnings: list[str]
    complete: bool = True

    @property
    def status(self) -> str:
        return "extracted" if self.excerpts else "unreadable"


def _bounded_segments(segments, warnings: list[str]) -> Extraction:
    excerpts: list[dict[str, str]] = []
    remaining = MAX_TEXT_CHARS
    truncated = False
    source_number = 0
    for locator, text in segments:
        text = text.strip()
        if not text:
            continue
        source_number += 1
        if remaining <= 0 or len(excerpts) >= MAX_SEGMENTS:
            truncated = True
            break
        complete_text = text
        if len(text) > remaining:
            text = text[:remaining]
            truncated = True
        # Preserve every ordinary source boundary and ID. Large paragraphs get
        # deterministic suffixes; offsets reference the original stripped text.
        for offset in range(0, len(text), MAX_DOCUMENT_TEXT_CHARS):
            if len(excerpts) >= MAX_SEGMENTS:
                truncated = True
                break
            chunk = text[offset : offset + MAX_DOCUMENT_TEXT_CHARS]
            item = {"locator": locator, "text": chunk}
            if len(complete_text) > MAX_DOCUMENT_TEXT_CHARS:
                part = offset // MAX_DOCUMENT_TEXT_CHARS + 1
                item["source_suffix"] = (
                    str(source_number) if part == 1 else f"{source_number}:part:{part}"
                )
                item["locator"] = f"{locator}, tegn {offset + 1}–{offset + len(chunk)}"
            elif source_number != len(excerpts) + 1:
                item["source_suffix"] = str(source_number)
            excerpts.append(item)
            remaining -= len(chunk)
        if truncated:
            break
    if truncated:
        warnings.append(
            f"Tekstudtrækket er afkortet til højst {danish_number(MAX_TEXT_CHARS)} tegn "
            f"og {danish_number(MAX_SEGMENTS)} tekstafsnit. Analysen kan ikke startes på et afkortet dokument; "
            "opdel originalen i mindre filer."
        )
    if not excerpts:
        warnings.append(
            "Der blev ikke fundet læsbar tekst. Upload en tekstbaseret fil; billeder og skannede sider kræver manuel gennemgang."
        )
    complete = not truncated and not any(
        "Kun de første" in warning for warning in warnings
    )
    return Extraction(excerpts, list(dict.fromkeys(warnings)), complete=complete)


def excerpt_source_id(version_id: str, excerpt: dict, number: int) -> str:
    return f"document:{version_id}:{excerpt.get('source_suffix', number)}"


def _pptx_segments(content: bytes):
    with zipfile.ZipFile(BytesIO(content)) as archive:
        presentation = safe_office_xml(archive.read("ppt/presentation.xml"))
        relation_path = "ppt/_rels/presentation.xml.rels"
        if relation_path not in archive.namelist():
            raise ValueError("PowerPoint-filen mangler slidehenvisninger.")
        relations = {
            item.attrib.get("Id"): item.attrib.get("Target", "")
            for item in safe_office_xml(archive.read(relation_path))
            if item.attrib.get("TargetMode") != "External"
        }
        for number, slide in enumerate(presentation.iter(f"{_P}sldId"), 1):
            target = relations.get(slide.attrib.get(f"{_R}id"), "")
            part = posixpath.normpath(
                target.lstrip("/")
                if target.startswith("/")
                else posixpath.join("ppt", target)
            )
            if not part.startswith("ppt/slides/") or part not in archive.namelist():
                raise ValueError(
                    "PowerPoint-filen indeholder ugyldige slidehenvisninger."
                )
            root = safe_office_xml(archive.read(part))
            paragraphs = [
                "".join(text.text or "" for text in paragraph.iter(f"{_A}t"))
                for paragraph in root.iter(f"{_A}p")
            ]
            yield f"Slide {number}", "\n".join(paragraphs)


def _docx_segments(content: bytes):
    with zipfile.ZipFile(BytesIO(content)) as archive:
        root = safe_office_xml(archive.read("word/document.xml"))
        body = root.find(f"{_W}body")
        if body is None:
            return
        paragraph_number = 0
        table_number = 0
        for item in body:
            if item.tag == f"{_W}p":
                paragraph_number += 1
                yield f"Afsnit {paragraph_number}", "".join(
                    node.text or "" for node in item.iter(f"{_W}t")
                )
            elif item.tag == f"{_W}tbl":
                table_number += 1
                for row_number, row in enumerate(item.findall(f"{_W}tr"), 1):
                    cells = [
                        "\n".join(
                            "".join(
                                node.text or "" for node in paragraph.iter(f"{_W}t")
                            )
                            for paragraph in cell.findall(f"{_W}p")
                        )
                        for cell in row.findall(f"{_W}tc")
                    ]
                    yield f"Tabel {table_number}, række {row_number}", " | ".join(cells)


def _pdf_segments(content: bytes, warnings: list[str]):
    from PyPDF2 import PdfReader

    reader = PdfReader(BytesIO(content), strict=False)
    if reader.is_encrypted:
        raise ValueError("PDF-filen er krypteret.")
    if len(reader.pages) > MAX_SEGMENTS:
        warnings.append(
            f"PDF-filen har over {MAX_SEGMENTS} sider. Kun de første {MAX_SEGMENTS} sider er tekstudtrukket."
        )
    for number, page in enumerate(reader.pages[:MAX_SEGMENTS], 1):
        yield f"Side {number}", page.extract_text() or ""


def extract_source(content: bytes, filename: str) -> Extraction:
    suffix = Path(filename).suffix.lower()
    if suffix == ".ppt":
        raise ValueError("Gem den ældre PowerPoint-fil som .pptx, og upload den igen.")
    if suffix not in SOURCE_EXTENSIONS:
        raise ValueError(
            "Upload PowerPoint (.pptx), Word (.docx), PDF eller UTF-8-tekst (.txt)."
        )
    if not content or len(content) > MAX_SOURCE_BYTES:
        raise ValueError("Upload en fil med indhold på højst 5 MB.")
    warnings = [SUPPLIER_NOTICE]
    if suffix in {".pptx", ".docx"}:
        validate_office_package(suffix, content)
    if suffix == ".pptx":
        warnings.append(
            "Tekst og tabeller på slides er udtrukket. Billeder, diagrammer, talenoter og indlejrede filer kræver manuel gennemgang."
        )
        segments = _pptx_segments(content)
    elif suffix == ".docx":
        warnings.append(
            "Brødtekst og tabeller er udtrukket. Sidehoveder, sidefødder, kommentarer og billeder kræver manuel gennemgang."
        )
        segments = _docx_segments(content)
    elif suffix == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise ValueError("Filen indeholder ikke en gyldig PDF.")
        warnings.append(
            "Kun PDF-filens tekstlag indgår. Skannede sider, billeder og tabellayout skal efterprøves i originalen."
        )
        segments = _pdf_segments(content, warnings)
    else:
        try:
            decoded = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Tekstfiler skal være gemt som UTF-8.") from exc
        segments = (
            (f"Afsnit {number}", paragraph)
            for number, paragraph in enumerate(re.split(r"\n\s*\n", decoded), 1)
        )
    try:
        return _bounded_segments(segments, warnings)
    except Exception:
        # User-controlled parser messages must not leak internal paths or document bytes.
        return Extraction(
            [],
            warnings
            + [
                "Dokumentet kunne ikke tekstudtrækkes sikkert. Gennemgå originalen eller upload en ny tekstbaseret version."
            ],
        )


class _HTMLText(HTMLParser):
    ignored = {
        "script",
        "style",
        "noscript",
        "svg",
        "canvas",
        "template",
        "head",
        "iframe",
    }
    blocks = {
        "p",
        "div",
        "section",
        "article",
        "li",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "br",
        "main",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden_depth = 0
        self.hidden_tags: list[str] = []
        self.current: list[str] = []
        self.paragraphs: list[str] = []

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.current)).strip()
        if text:
            self.paragraphs.append(text)
        self.current = []

    def handle_starttag(self, tag, attrs):
        if tag in self.ignored:
            self.hidden_tags.append(tag)
            self.hidden_depth += 1
        if not self.hidden_depth and tag in self.blocks:
            self.flush()

    def handle_endtag(self, tag):
        if tag in self.ignored and tag in self.hidden_tags:
            self.hidden_tags.remove(tag)
            self.hidden_depth -= 1
        elif not self.hidden_depth and tag in self.blocks:
            self.flush()

    def handle_data(self, data):
        if not self.hidden_depth:
            self.current.append(data)


def _html_snapshot_text(paragraphs: list[str]) -> str:
    """Pack new snapshots into source blocks without changing stored TXT parsing.

    Keep HTML paragraph boundaries as single newlines inside a block. Only a
    block boundary uses a blank line, so many short DOM elements cannot consume
    the 200-excerpt budget. Split prose at spaces and keep an unusually long
    unbroken token intact rather than corrupting a URL or identifier.
    """
    blocks: list[str] = []
    current: list[str] = []
    current_length = 0
    for paragraph in paragraphs:
        for index, word in enumerate(paragraph.split(" ")):
            separator = "\n" if index == 0 else " "
            if current and current_length + 1 + len(word) > HTML_BLOCK_CHARS:
                blocks.append("".join(current))
                current = []
                current_length = 0
            if current:
                current.append(separator)
                current_length += 1
            current.append(word)
            current_length += len(word)
    if current:
        blocks.append("".join(current))
    return "\n\n".join(blocks)


def web_snapshot(source: PublicSource) -> tuple[str, bytes, dict[str, Any]]:
    metadata = {
        "source_url": source.url,
        "retrieved_at": source.retrieved_at,
        "raw_source_sha256": source.sha256,
        "source_media_type": source.media_type,
    }
    hostname = urlsplit(source.url).hostname or "hjemmeside"
    if source.media_type == "application/pdf":
        return f"{hostname}.pdf", source.content, metadata
    if source.media_type == "text/plain":
        text = source.content.decode("utf-8-sig", errors="replace")
    else:
        parser = _HTMLText()
        parser.feed(source.content.decode("utf-8-sig", errors="replace"))
        parser.close()
        parser.flush()
        text = _html_snapshot_text(parser.paragraphs)
        metadata["text_snapshot_format"] = "html-blocks-2"
    if not text.strip():
        raise ValueError(
            "Hjemmesiden indeholder ingen læsbar tekst. Upload leverandørens dokumentation som en fil."
        )
    return f"{hostname}.txt", text.encode("utf-8"), metadata


def _source_payload(
    version: MunicipalDocumentVersion, extraction: dict | None = None
) -> dict[str, Any]:
    metadata = version.version_metadata or {}
    material = (
        extraction if extraction is not None else metadata.get("source_material", {})
    )
    excerpts = [
        {
            "id": excerpt_source_id(str(version.id), item, number),
            "locator": item["locator"],
            "text": item["text"],
        }
        for number, item in enumerate(material.get("excerpts", []), 1)
    ]
    return {
        "id": version.id,
        "document_id": version.document_id,
        "version_id": version.id,
        "title": version.document.title,
        **source_classification(version.document.category),
        "original_filename": version.original_filename,
        "media_type": version.media_type,
        "uploaded_at": version.created_at.isoformat() if version.created_at else None,
        "source_url": metadata.get("source_url"),
        "retrieved_at": metadata.get("retrieved_at"),
        "checksum": version.content_sha256,
        "status": "extracted" if excerpts else "unreadable",
        "extraction_complete": material.get("complete", True),
        "review_status": "unreviewed",
        "document_status": version.status,
        "excerpts": excerpts,
        "warnings": source_warnings(
            material.get("warnings", []), version.document.category
        ),
        "download_url": f"/api/v3/documents/{version.document_id}/versions/{version.id}/download",
    }


def save_case_source(
    db: Session,
    case_id: str,
    *,
    filename: str,
    content: bytes,
    actor: str,
    title: str | None = None,
    category: str = "supplier_documentation",
    provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Own the transaction: exact bytes + draft metadata + case link all succeed or none do."""
    if get_case(db, case_id) is None:
        raise LookupError("Sagen findes ikke.")
    if category not in DOCUMENT_CATEGORIES:
        raise ValueError("Vælg en gyldig dokumentkategori.")
    normalized_title = (title or filename).strip()
    if len(normalized_title) < 3 or len(normalized_title) > 500:
        raise ValueError("Dokumentets titel skal være mellem 3 og 500 tegn.")
    extraction = extract_source(content, filename)
    classification = source_classification(category)
    metadata = {
        **(provenance or {}),
        "source_material": {
            "extraction_version": EXTRACTION_VERSION,
            **classification,
            "review_status": "unreviewed",
            "excerpts": extraction.excerpts,
            "warnings": source_warnings(extraction.warnings, category),
            "complete": extraction.complete,
        },
    }
    stored = None
    committed = False
    try:
        document = create_document(
            db,
            title=normalized_title,
            category=category,
            created_by=actor,
            description=classification["evidence_notice"],
            tags=["sagsgrundlag", "ikke-juridisk-godkendt"],
        )
        stored = store_document_bytes(
            document_id=document.id,
            version_number=1,
            filename=filename,
            content=content,
        )
        version = add_document_version(
            db,
            document_id=document.id,
            original_filename=stored.original_filename,
            media_type=stored.media_type,
            size_bytes=stored.size_bytes,
            sha256=stored.sha256,
            uploaded_by=actor,
            metadata=metadata,
        )
        link_document_to_case(
            db,
            case_db_id=case_id,
            document_id=document.id,
            document_version_id=version.id,
            link_role="evidence",
            linked_by=actor,
            allow_unapproved=True,
            note=classification["evidence_notice"],
        )
        result = _source_payload(version)
        db.commit()
        committed = True
        return result
    except Exception:
        db.rollback()
        if stored is not None and not committed:
            delete_document_bytes(stored.storage_key)
        raise


def save_case_url(
    db: Session,
    case_id: str,
    *,
    url: str,
    actor: str,
    title: str | None = None,
    category: str = "supplier_documentation",
) -> dict[str, Any]:
    if get_case(db, case_id) is None:
        raise LookupError("Sagen findes ikke.")
    source = fetch_public_source(url)
    filename, content, provenance = web_snapshot(source)
    return save_case_source(
        db,
        case_id,
        filename=filename,
        content=content,
        actor=actor,
        title=title or f"Kildeside: {urlsplit(source.url).hostname}",
        category=category,
        provenance=provenance,
    )


def list_case_source_material(db: Session, case_id: str) -> list[dict[str, Any]]:
    if get_case(db, case_id) is None:
        raise LookupError("Sagen findes ikke.")
    links = list_case_documents(db, case_id)
    output_ids = {
        link.document_version_id for link in links if link.link_role == "output"
    }
    seen = set()
    items = []
    for link in links:
        version = link.version
        if version is None or version.id in seen or version.id in output_ids:
            continue
        seen.add(version.id)
        try:
            content = read_document_bytes(
                version.storage_key, expected_sha256=version.content_sha256
            )
            # Generic document-bank uploads accept client metadata. Re-extract
            # verified bytes so a forged cached excerpt cannot become evidence.
            extraction = extract_source(content, version.original_filename)
            material = {
                "excerpts": extraction.excerpts,
                "warnings": extraction.warnings,
                "complete": extraction.complete,
            }
        except Exception:
            material = {
                "excerpts": [],
                "warnings": [
                    SUPPLIER_NOTICE,
                    "Den gemte kilde kunne ikke læses eller bestod ikke kontrol af checksum. Upload en ny version.",
                ],
            }
        items.append(_source_payload(version, material))
    return items


def case_source_manifest(db: Session, case_id: str) -> list[dict[str, Any]]:
    """Include unreadable inputs so unchanged readable text cannot hide a new file.

    Outputs are excluded using the same deny rule as text extraction. Only
    allowlisted version/link metadata is retained, never storage paths or
    arbitrary uploaded metadata.
    """
    links = list_case_documents(db, case_id)
    output_ids = {
        link.document_version_id for link in links if link.link_role == "output"
    }
    manifest = []
    for link in links:
        if link.document_version_id in output_ids:
            continue
        version = link.version
        metadata = (version.version_metadata or {}) if version else {}
        manifest.append(
            {
                "link_id": link.id,
                "document_id": link.document_id,
                "document_version_id": link.document_version_id,
                "link_role": link.link_role,
                "title": link.document.title if link.document else None,
                "category": link.document.category if link.document else None,
                "filename": version.original_filename if version else None,
                "checksum": version.content_sha256 if version else None,
                "size_bytes": version.size_bytes if version else None,
                "version": version.version_number if version else None,
                "source_url": metadata.get("source_url"),
            }
        )
    return sorted(manifest, key=lambda item: item["link_id"])


def case_source_evidence(db: Session, case_id: str) -> list[dict[str, Any]]:
    """Stable source identifiers for this case only; outputs cannot become evidence."""
    result = []
    for item in list_case_source_material(db, case_id):
        if not item["extraction_complete"]:
            raise ValueError(
                f"Dokumentet '{item['title']}' overskrider grænsen for tekstudtræk. "
                "Opdel originalen i mindre filer. Ingen delvis analyse er gemt."
            )
        version = db.get(MunicipalDocumentVersion, item["version_id"])
        for excerpt in item["excerpts"]:
            evidence = {
                "id": excerpt["id"],
                "title": item["title"],
                "text": excerpt["text"],
                "version": str(version.version_number),
                "checksum": item["checksum"],
                "locator": excerpt["locator"],
                "document_version_id": item["version_id"],
                **source_classification(item["category"]),
                "review_status": "unreviewed",
            }
            if item["source_url"]:
                evidence["source_url"] = item["source_url"]
            result.append(evidence)
    return result
