"""Shared evidence budgets for intake, drafting and the materials UI."""

MAX_DOCUMENTS = 25
MAX_TOTAL_TEXT_CHARS = 500_000
MAX_DOCUMENT_TEXT_CHARS = 200_000
MAX_TOTAL_EXCERPTS = 1_000
MAX_DOCUMENT_EXCERPTS = 500
MAX_SOURCE_PACK_CHARS = 1_200_000
ANALYSIS_TIMEOUT_SECONDS = 600


def danish_number(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def public_analysis_limits() -> dict[str, int]:
    from src.services.safe_public_fetch import MAX_SOURCE_BYTES

    return {
        "max_documents": MAX_DOCUMENTS,
        "max_total_text_chars": MAX_TOTAL_TEXT_CHARS,
        "max_document_text_chars": MAX_DOCUMENT_TEXT_CHARS,
        "max_total_excerpts": MAX_TOTAL_EXCERPTS,
        "max_document_excerpts": MAX_DOCUMENT_EXCERPTS,
        "max_file_bytes": MAX_SOURCE_BYTES,
    }
