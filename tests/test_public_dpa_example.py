"""Offline checks for the public-source example's outbound data boundary."""

from copy import deepcopy
import json
from pathlib import Path

import pytest

from scripts.run_public_dpa_example import validate_generation_input
from src.services.dpia_assessment import DPIAAssessmentRequest


@pytest.fixture
def example_input():
    fixture = json.loads(
        (
            Path(__file__).resolve().parents[1]
            / "examples/dpia/aicom-communication.json"
        ).read_text()
    )
    bundle = {
        "documents": [
            {"link_role": "evidence", "document_version_id": "public-dpa"},
            {"link_role": "output", "document_version_id": "old-test-receipt"},
        ],
        "assessments": {
            "dpia": [
                {
                    "id": "baseline",
                    "request_payload": DPIAAssessmentRequest.model_validate(
                        fixture
                    ).model_dump(mode="json"),
                }
            ]
        },
    }
    return fixture, bundle


def test_public_source_and_matching_canonical_fixture_are_accepted_without_mutation(
    example_input,
):
    fixture, bundle = example_input
    previous = deepcopy(bundle)
    validate_generation_input(bundle, fixture, "baseline", "public-dpa")
    assert bundle == previous


@pytest.mark.parametrize("role", ["evidence", "basis", "attachment", "template", None])
def test_additional_non_output_document_stops_reused_example(example_input, role):
    fixture, bundle = example_input
    bundle["documents"].append(
        {"link_role": role, "document_version_id": "unrelated-private-document"}
    )
    with pytest.raises(ValueError, match="andre kilder"):
        validate_generation_input(bundle, fixture, "baseline", "public-dpa")


def test_changed_or_unavailable_saved_questionnaire_stops_reused_example(example_input):
    fixture, bundle = example_input
    bundle["assessments"]["dpia"][0]["request_payload"][
        "purpose"
    ] = "Different potentially private case purpose."
    with pytest.raises(ValueError, match="afviger"):
        validate_generation_input(bundle, fixture, "baseline", "public-dpa")
    bundle["assessments"]["dpia"][0].pop("request_payload")
    with pytest.raises(ValueError, match="kunne ikke kontrolleres"):
        validate_generation_input(bundle, fixture, "baseline", "public-dpa")


def test_missing_or_output_classified_dpa_stops_generation(example_input):
    fixture, bundle = example_input
    bundle["documents"].append(
        {"link_role": "output", "document_version_id": "public-dpa"}
    )
    with pytest.raises(ValueError, match="markeret som sagsoutput"):
        validate_generation_input(bundle, fixture, "baseline", "public-dpa")
    bundle["documents"] = []
    with pytest.raises(ValueError, match="andre kilder"):
        validate_generation_input(bundle, fixture, "baseline", "public-dpa")
