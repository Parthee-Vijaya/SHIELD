"""Real Python/Node handoff with synthetic model replies, never provider calls."""

from copy import deepcopy
import json
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

import pytest

from src.database.procurement import ProcurementAnalysis
from src.services import procurement_analysis as service
from tests import test_procurement_analysis as procurement_fixtures
from tests.test_procurement_analysis import SOURCE

setup = procurement_fixtures.setup


@pytest.mark.parametrize(
    "bridge_name", ["run_codex_dpia_test", "run_codex_procurement"]
)
def test_codex_bridge_accepts_large_source_pack_but_keeps_draft_limit(
    tmp_path, bridge_name
):
    from importlib import import_module
    from src.services.analysis_limits import MAX_RAW_INPUT_CHARS

    bridge = import_module(f"scripts.{bridge_name}")
    payload = {"text": "å" * 1_100_000}
    source_file = tmp_path / "source-pack.json"
    source_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError):
        bridge.read_json(source_file)
    assert bridge.read_json(source_file, max_bytes=MAX_RAW_INPUT_CHARS * 4) == payload


@pytest.mark.parametrize("fail_second", [False, True])
def test_python_node_batches_consolidate_and_save_only_complete_result(
    setup, monkeypatch, fail_second
):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node runtime is required for cross-language integration")
    _, factory, case_id = setup
    sources = []
    for index in range(30):
        version = str(uuid4())
        text = (
            "Kundens data hostes i Danmark."
            if index < 25
            else "Kundens data hostes i Tyskland."
        ) + "\n"
        sources.append(
            {
                **SOURCE,
                "id": f"document:{version}:1",
                "document_version_id": version,
                "text": text.ljust(20_000, "x"),
            }
        )
    monkeypatch.setattr(service, "evidence_for_case", lambda *args: deepcopy(sources))
    calls = []

    def worker(payload):
        calls.append(payload)
        completed = subprocess.run(
            [
                node,
                "tests/fixtures/batched-material-worker.mts",
                *(["--fail-second"] if fail_second else []),
            ],
            cwd=Path(__file__).resolve().parents[1],
            input=json.dumps(payload, ensure_ascii=False),
            capture_output=True,
            text=True,
            timeout=60,
            env={"PATH": str(Path(node).parent)},
        )
        if completed.returncode:
            raise service.MaterialUnavailableError(
                "A synthetic batch failed; no partial result saved."
            )
        return json.loads(completed.stdout)

    with factory() as db:
        if fail_second:
            with pytest.raises(service.MaterialUnavailableError, match="batch failed"):
                service.analyze_case(db, case_id, worker=worker)
            assert db.query(ProcurementAnalysis).count() == 0
        else:
            result = service.analyze_case(db, case_id, worker=worker)
            assert result["sources"] == sources
            assert result["batching"]["batch_count"] == 2
            assert result["batching"]["source_text_chars"] == 600_000
            assert result["batching"]["map_call_count"] == 2
            assert result["batching"]["synthesis_call_count"] == 1
            assert result["batching"]["cross_batch_conflict_count"] == 1
            assert not any(
                fact["field"] == "hosting_region" for fact in result["facts"]
            )
            assert len(result["conflicts"]) >= 1
            assert result["review"]["checks"]
            assert result["status"] == "requires_human_review"
            assert db.query(ProcurementAnalysis).count() == 1
    assert len(calls) == 1
