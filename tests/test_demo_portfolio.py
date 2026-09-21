"""The demonstration registry stays synthetic and fail-closed."""

import json
from pathlib import Path
from unittest.mock import Mock

import pytest

from src.services.dpia_assessment import DPIAAssessmentRequest
from scripts.run_demo_portfolio import run_portfolio
import scripts.run_demo_portfolio as portfolio
import scripts.run_public_dpa_example as public_example


ROOT = Path(__file__).resolve().parents[1]


def test_four_distinct_cases_have_valid_synthetic_questionnaires():
    profiles = json.loads((ROOT / "examples/dpia/demo-portfolio.json").read_text())
    assert len(profiles) == len({p["case_key"] for p in profiles}) == 4
    for profile in profiles:
        request = DPIAAssessmentRequest.model_validate_json(
            (ROOT / profile["fixture"]).read_text()
        )
        assert profile["case_key"].startswith("EKSEMPEL-")
        assert request.project_name.startswith("EKSEMPEL")
        assert "fiktiv" in request.organisation
        assert request.verified_controls == []
        assert not request.dpo_involved
        assert request.legal_basis == "not_assessed"
        assert profile["source_url"].startswith("https://")


def test_unknown_selection_stops_before_network_access():
    with pytest.raises(ValueError, match="Ukendt"):
        run_portfolio("http://127.0.0.1:8001", ["not-a-demo"])


@pytest.fixture
def isolated_portfolio(tmp_path, monkeypatch):
    registry = tmp_path / "examples" / "dpia"
    registry.mkdir(parents=True)
    (registry / "demo-portfolio.json").write_text(
        json.dumps(
            [
                {
                    "id": "synthetic-openai",
                    "vendor_id": "openai",
                    "source_dir": "public-source",
                    "fixture": "synthetic-fixture.json",
                }
            ]
        )
    )
    source_dir = tmp_path / "public-source"
    source_dir.mkdir()
    run_spy = Mock(side_effect=AssertionError("Model flow must never start"))
    monkeypatch.setattr(portfolio, "ROOT", tmp_path)
    monkeypatch.setattr(portfolio, "run", run_spy)
    return source_dir / "manifest.json", run_spy


def test_non_aicom_without_vendor_claims_fails_before_model_flow(isolated_portfolio):
    manifest, run_spy = isolated_portfolio
    manifest.write_text(json.dumps({"sources": []}))
    result = portfolio.run_portfolio("http://127.0.0.1:8001")
    assert result == [
        {
            "example_id": "synthetic-openai",
            "status": "failed",
            "error_type": "ValueError",
        }
    ]
    run_spy.assert_not_called()
    assert (
        json.loads((portfolio.ROOT / ".cache/demo-portfolio/latest.json").read_text())
        == result
    )


def test_duplicate_vendor_claim_ids_fail_before_model_flow(isolated_portfolio):
    manifest, run_spy = isolated_portfolio
    claims = [
        {
            "id": identifier,
            "label": "Syntetisk test",
            "text": "Syntetisk påstand.",
            "expected_requires_review": expected,
        }
        for identifier, expected in [
            ("duplicate", False),
            ("duplicate", True),
            ("third", True),
        ]
    ]
    manifest.write_text(json.dumps({"sources": [], "jev_claims": claims}))
    result = portfolio.run_portfolio("http://127.0.0.1:8001")
    assert result == [
        {
            "example_id": "synthetic-openai",
            "status": "failed",
            "error_type": "ValueError",
        }
    ]
    run_spy.assert_not_called()


def test_non_aicom_source_without_manifest_does_not_fetch_or_create_files(
    tmp_path, monkeypatch
):
    fetch = Mock(side_effect=AssertionError("Network access must never start"))
    monkeypatch.setattr(public_example.requests, "get", fetch)
    source_dir = tmp_path / "unprepared-source"
    with pytest.raises(ValueError, match="manifest først"):
        public_example.load_source(source_dir, "https://vendor.example/legal/dpa")
    fetch.assert_not_called()
    assert not source_dir.exists()
