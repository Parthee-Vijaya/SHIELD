"""Batch receipts prove full coverage without exposing intermediate chain of thought."""

import pytest

from src.services.analysis_limits import (
    validate_batching_metadata,
    validate_source_budget,
)


def metadata(sources):
    return {
        "strategy": "single-pass-v1",
        "batch_count": 1,
        "source_count": len(sources),
        "source_text_chars": sum(len(item["text"]) for item in sources),
        "batches": [
            {
                "index": 1,
                "source_ids": [item["id"] for item in sources],
                "source_text_chars": sum(len(item["text"]) for item in sources),
                "document_count": 1,
            }
        ],
        "map_call_count": 0,
        "synthesis_call_count": 2,
    }


def test_unicode_counts_match_exact_codepoints_and_document_parts():
    sources = [
        {"id": "document:abc", "text": "Å😀"},
        {"id": "document:abc:part:2", "text": "Slut"},
    ]
    receipt = metadata(sources)
    assert receipt["source_text_chars"] == 6
    assert validate_batching_metadata(receipt, sources) == receipt


@pytest.mark.parametrize(
    "mutation", ["missing", "duplicate", "chars", "index", "calls", "extra"]
)
def test_invalid_batch_receipt_is_rejected(mutation):
    sources = [{"id": "document:abc:1", "text": "Supplier evidence"}]
    receipt = metadata(sources)
    if mutation == "missing":
        receipt["batches"][0]["source_ids"] = ["missing-id"]
    elif mutation == "duplicate":
        receipt["batches"][0]["source_ids"] *= 2
    elif mutation == "chars":
        receipt["source_text_chars"] += 1
    elif mutation == "index":
        receipt["batches"][0]["index"] = 2
    elif mutation == "calls":
        receipt["map_call_count"] = 1
    else:
        receipt["unexpected_secret"] = "reject"
    with pytest.raises(ValueError):
        validate_batching_metadata(receipt, sources)


def test_twenty_batch_safety_limit_is_enforced_before_model():
    # Repeated document cycles can exceed twenty batches even when the unique
    # document count and text volume remain below their overall limits.
    sources = [
        {"id": f"document:a{index % 100}:{index}", "text": "x"} for index in range(501)
    ]
    with pytest.raises(ValueError, match="over 20 analysebatches"):
        validate_source_budget(sources)


def test_per_source_bound_rejects_unsplit_content():
    with pytest.raises(ValueError, match="kildeuddrag"):
        validate_source_budget([{"id": "document:a", "text": "x" * 200_001}])


def test_jev_review_allows_more_than_one_hundred_bounded_calls():
    from src.services.dpia_ai import _Review
    from tests.test_procurement_analysis import review, DRAFT

    payload = review(DRAFT)
    payload["usage"] = [{"input_tokens": 1000, "output_tokens": 1} for _ in range(125)]
    assert len(_Review.model_validate(payload).usage) == 125
    payload["usage"] *= 5
    with pytest.raises(ValueError):
        _Review.model_validate(payload)
