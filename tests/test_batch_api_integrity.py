"""Long-running analysis must use complete, unchanged source versions."""

from copy import deepcopy

import pytest

from src.database.dpia import DPIAAssessmentRecord
from src.services import dpia_ai
from src.services.source_material import save_case_source
from tests import test_dpia_ai as dpia_fixtures
from tests.test_dpia_ai import create_base, worker_output

api = dpia_fixtures.api
database = dpia_fixtures.database


def save_source(factory, case_id, text, filename="supplier.txt"):
    with factory() as db:
        return save_case_source(
            db,
            case_id,
            filename=filename,
            content=text.encode(),
            actor="Test reviewer",
        )


def test_incomplete_document_returns_actionable_error_before_model(
    api,
    database,
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("DOCUMENT_BANK_STORAGE_DIR", str(tmp_path / "documents"))
    _, base_id = create_base(database)
    with database() as db:
        base = db.get(DPIAAssessmentRecord, base_id)
        case_id, snapshot = base.case_db_id, deepcopy(base.result_payload)
    save_source(database, case_id, "x" * 2_000_001)
    monkeypatch.setattr(
        dpia_ai,
        "_run_worker",
        lambda *a, **kw: pytest.fail("Incomplete evidence must stop before model"),
    )
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 422, response.text
    with database() as db:
        assert db.query(DPIAAssessmentRecord).count() == 1
        assert db.get(DPIAAssessmentRecord, base_id).result_payload == snapshot


@pytest.mark.parametrize("amendment", ["Et nyt tillæg ændrer aftalegrundlaget.", "   "])
def test_document_added_during_model_call_preserves_existing_report(
    api,
    database,
    monkeypatch,
    tmp_path,
    amendment,
):
    monkeypatch.setenv("DOCUMENT_BANK_STORAGE_DIR", str(tmp_path / "documents"))
    case_id, base_id = create_base(database)
    save_source(database, case_id, "Leverandørens oprindelige aftalegrundlag.")
    with database() as db:
        snapshot = deepcopy(db.get(DPIAAssessmentRecord, base_id).result_payload)

    def worker(payload, **kwargs):
        # Independent committed source upload while the model request is running.
        save_source(database, case_id, amendment, "amendment.txt")
        return worker_output(
            dpia_ai.DPIAAssessmentResponse.model_validate(payload["result"])
        )

    monkeypatch.setattr(dpia_ai, "_run_worker", worker)
    response = api.post(f"/api/dpia/assessments/{base_id}/generate")
    assert response.status_code == 409, response.text
    assert "Kildematerialet er ændret" in response.json()["detail"]
    with database() as db:
        assert db.query(DPIAAssessmentRecord).count() == 1
        assert db.get(DPIAAssessmentRecord, base_id).result_payload == snapshot
