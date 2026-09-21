"""Explicit local Codex bridge; never an automatic production fallback.

The actual Codex model must create the supplied draft separately. This script
defaults to synthetic input; a planned municipal scenario requires explicit
opt-in. It freezes sources, validates the draft, obtains a real Jev review,
and persists a new immutable assessment version. It never reads credentials.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from src.database.cases import Case  # noqa: E402
from src.database.dpia import (  # noqa: E402
    DPIAAssessmentRecord,
    assessment_result_payload,
    get_assessment,
    save_assessment,
)
from src.services.dpia_ai import (  # noqa: E402
    AIGenerationUnavailable,
    InvalidAIDraft,
    _Draft,
    add_case_document_sources,
    apply_ai_draft,
    build_sources,
)
from src.services.dpia_assessment import (  # noqa: E402
    DPIAAssessmentRequest,
    DPIAAssessmentResponse,
    RISK_DEFINITIONS,
    SECTION_TITLES,
)
from src.services.ai_presentation import model_label  # noqa: E402
from src.services.analysis_limits import (  # noqa: E402
    ANALYSIS_TIMEOUT_SECONDS,
    MAX_RAW_INPUT_CHARS,
)

ALLOWED_MODELS = {"gpt-5.6-sol", "gpt-6-astra"}
PROMPT_VERSION = "codex-local-dpia-test-2026-09-20-v1"
PLANNED_PROMPT_VERSION = "codex-local-dpia-planned-scenario-2026-09-21-v1"
MAX_FILE_BYTES = 2_000_000
# UTF-8 may need four bytes per character.
MAX_SOURCE_PACK_FILE_BYTES = MAX_RAW_INPUT_CHARS * 4


def digest(value: Any) -> str:
    return sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def base_fingerprint(record) -> str:
    return digest(
        {
            "id": record.id,
            "case_db_id": record.case_db_id,
            "version": record.version,
            "project_name": record.project_name,
            "organisation": record.organisation,
            "status": record.status,
            "risk_level": record.risk_level,
            "template_version": record.template_version,
            "request": record.request_payload,
            "result": record.result_payload,
        }
    )


def _latest_assessment_id(db: Session, case_db_id: str) -> str | None:
    latest = (
        db.query(DPIAAssessmentRecord)
        .filter(DPIAAssessmentRecord.case_db_id == case_db_id)
        .order_by(
            DPIAAssessmentRecord.version.desc(),
            DPIAAssessmentRecord.created_at.desc(),
            DPIAAssessmentRecord.id.desc(),
        )
        .first()
    )
    return latest.id if latest else None


def prepare_pack(
    db: Session,
    assessment_id: str,
    expected_name: str,
    *,
    planned_scenario: bool = False,
    _allow_historical_base: bool = False,
) -> dict:
    if not isinstance(planned_scenario, bool):
        raise ValueError("Scenarievalg skal være eksplicit angivet som til eller fra.")
    record = get_assessment(db, assessment_id)
    if (
        record is None
        or not record.case_db_id
        or record.project_name != expected_name
        or not expected_name.strip()
        or (
            not planned_scenario
            and not expected_name.startswith(("E2E TEST", "EKSEMPEL"))
        )
    ):
        raise ValueError(
            "Vælg det præcise navn på en vurdering med sagstilknytning. "
            "Uden --planned-scenario kræves en syntetisk E2E TEST- eller EKSEMPEL-vurdering."
        )
    if planned_scenario and record.request_payload.get("project_name") != expected_name:
        raise ValueError(
            "Scenariets navn skal stemme præcist med det gemte sagsgrundlag."
        )
    if db.get(Case, record.case_db_id) is None:
        raise ValueError("Den tilknyttede sag findes ikke.")
    if (
        planned_scenario
        and not _allow_historical_base
        and _latest_assessment_id(db, record.case_db_id) != record.id
    ):
        raise ValueError(
            "En nyere rapportversion findes på sagen. Klargør kildepakken fra den seneste version."
        )
    request = DPIAAssessmentRequest.model_validate(record.request_payload)
    result = DPIAAssessmentResponse.model_validate(assessment_result_payload(record))
    sources = build_sources(request, result)
    limitations = add_case_document_sources(db, record.case_db_id, sources)
    pack = {
        "assessment_id": record.id,
        "case_db_id": record.case_db_id,
        "expected_name": expected_name,
        "request": request.model_dump(mode="json"),
        "result": result.model_dump(
            mode="json", exclude={"ai_generation", "reading_guide"}
        ),
        "sources": sources,
        "limitations": limitations,
        "base_fingerprint": base_fingerprint(record),
    }
    if planned_scenario:
        pack["planned_scenario"] = True
    pack["source_pack_sha256"] = digest(pack)
    return pack


def check_pack(
    db: Session, pack: dict, *, allowed_completed_id: str | None = None
) -> None:
    planned_scenario = pack.get("planned_scenario", False)
    expected = prepare_pack(
        db,
        pack["assessment_id"],
        pack["expected_name"],
        planned_scenario=planned_scenario,
        _allow_historical_base=True,
    )
    if digest(expected) != digest(pack):
        raise ValueError(
            "Sagsgrundlaget eller kildepakken er ændret. Klargør en ny kildepakke."
        )
    if planned_scenario and _latest_assessment_id(db, pack["case_db_id"]) not in {
        pack["assessment_id"],
        allowed_completed_id,
    }:
        raise ValueError(
            "En nyere rapportversion findes på sagen. Klargør en ny kildepakke."
        )


def validate_draft(pack: dict, raw: dict) -> dict:
    """Reject malformed IDs, sources and locked text before any paid request."""
    try:
        draft = _Draft.model_validate(raw)
    except ValidationError:
        raise InvalidAIDraft(
            "Codex-udkastet overholder ikke rapportens datakontrakt."
        ) from None
    expected = {
        "sections": set(SECTION_TITLES),
        "risks": {risk.id for risk in RISK_DEFINITIONS},
    }
    for group, required in expected.items():
        ids = [item.id for item in getattr(draft, group)]
        if set(ids) != required or len(ids) != len(set(ids)):
            raise InvalidAIDraft(
                "Udkastet skal indeholde præcis de 39 afsnit og 33 risici."
            )
    recommendation_ids = [item.id for item in draft.recommendations]
    if len(recommendation_ids) != len(set(recommendation_ids)):
        raise InvalidAIDraft("Udkastets anbefalinger skal have entydige ID'er.")
    sources = pack["sources"]
    known = {source["id"] for source in sources}
    if not known or len(known) != len(sources):
        raise InvalidAIDraft("Kildepakken indeholder ugyldige kilde-ID'er.")
    references = [draft.summary_source_ids] + [
        item.source_ids
        for item in [
            *draft.sections,
            *draft.risks,
            *draft.additional_risks,
            *draft.recommendations,
        ]
    ]
    if any(not set(ids).issubset(known) for ids in references):
        raise InvalidAIDraft("Codex-udkastet henviser til en ukendt kilde.")
    section_texts = {section.id: section.text for section in draft.sections}
    for section in pack["result"]["sections"]:
        if (
            section["review_status"] in {"missing_information", "not_applicable"}
            and section_texts[section["id"]] != section["text"]
        ):
            raise InvalidAIDraft(
                "Codex-udkastet må ikke ændre låste afsnit med manglende oplysninger eller uden relevans."
            )
    return draft.model_dump(mode="json")


def run_jev(pack: dict, draft: dict) -> dict:
    """The child runtime alone loads the key; no logs or stderr are exposed."""
    try:
        completed = subprocess.run(
            ["node", "--env-file-if-exists=.env.local", "ai-gateway/review-draft.mts"],
            input=json.dumps(
                {"result": pack["result"], "sources": pack["sources"], "draft": draft},
                ensure_ascii=False,
                allow_nan=False,
            ),
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=ANALYSIS_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise AIGenerationUnavailable(
            "Jev-kontrollen kunne ikke gennemføres. Ingen ny analyse er gemt."
        ) from None
    if len(completed.stdout.encode()) > MAX_FILE_BYTES:
        raise AIGenerationUnavailable(
            "Jev-kontrollen fejlede. Ingen ny analyse er gemt."
        )
    if completed.returncode:
        messages = {
            "evaluation_timeout": "Jev-kontrollen overskred tidsgrænsen",
            "review_context_too_large": "Jev-kontrollens kildegrundlag overskrider kontekstgrænsen",
            "gateway_not_configured": "AI Gateway-nøglen er ikke konfigureret lokalt",
            "paid_credits_required": "Jev-kontrollen kræver betalte AI Gateway-kreditter",
            "evaluation_rate_limited": "Jev-kontrollen blev begrænset af tjenestens kapacitet",
            "evaluation_access_denied": "AI Gateway afviste adgang til Jev",
            "evaluation_temporarily_unavailable": "Jev-tjenesten er midlertidigt utilgængelig",
            "evaluation_failed": "Jev-kontrollen fejlede",
        }
        try:
            code = json.loads(completed.stdout).get("error", {}).get("code")
        except (ValueError, TypeError, AttributeError):
            code = None
        message = (
            messages.get(code, "Jev-kontrollen fejlede")
            if isinstance(code, str)
            else "Jev-kontrollen fejlede"
        )
        raise AIGenerationUnavailable(f"{message}. Ingen ny analyse er gemt.")
    try:
        review = json.loads(completed.stdout)
        if not isinstance(review, dict) or review.get("model") != "typesafe-ai/jev":
            raise ValueError
    except (ValueError, TypeError):
        raise AIGenerationUnavailable(
            "Jev returnerede ikke en gyldig kontrol. Ingen ny analyse er gemt."
        ) from None
    return review


def import_draft(
    db: Session,
    pack: dict,
    raw_draft: dict,
    *,
    model: str,
    run_id: str,
    reviewer=run_jev,
) -> dict:
    if model not in ALLOWED_MODELS or not re.fullmatch(
        r"[A-Za-z0-9_./:-]{1,200}", run_id
    ):
        raise ValueError("Angiv faktisk Codex-model og et entydigt kørsels-ID.")
    planned_scenario = pack.get("planned_scenario", False) is True
    provider = "codex-local" if planned_scenario else "codex-local-test"
    identity_scope = (
        "codex-local:planned-scenario" if planned_scenario else "codex-local-test"
    )
    new_id = str(uuid5(NAMESPACE_URL, f"judge-dredd:{identity_scope}:{run_id}"))
    check_pack(db, pack, allowed_completed_id=new_id)
    draft = validate_draft(pack, raw_draft)
    provenance = {
        "provider": provider,
        "model": model,
        "run_id": run_id,
        "source_pack_sha256": pack["source_pack_sha256"],
        "draft_sha256": digest(draft),
        "base_fingerprint": pack["base_fingerprint"],
    }
    if planned_scenario:
        provenance.update(
            {
                "planned_scenario": True,
                "model_run_provenance": "operator_reported",
            }
        )

    def already_saved():
        saved = get_assessment(db, new_id)
        if saved is None:
            return None
        stored = saved.result_payload.get("ai_generation", {})
        if any(stored.get(key) != value for key, value in provenance.items()):
            raise ValueError("Kørsels-ID'et er allerede brugt til et andet udkast.")
        if saved.case_db_id != pack["case_db_id"]:
            raise ValueError(
                "Den tidligere rapportversion er knyttet til en anden sag."
            )
        return {
            "assessment_id": saved.id,
            "case_db_id": saved.case_db_id,
            "version": saved.version,
            "already_saved": True,
        }

    previous = already_saved()
    if previous:
        db.rollback()
        return previous
    db.rollback()  # No SQLite transaction remains open during the model call.
    review = reviewer(pack, draft)
    now = datetime.now(UTC)
    original = DPIAAssessmentResponse.model_validate(pack["result"])
    generated = apply_ai_draft(
        original,
        {
            "draft": draft,
            "review": review,
            "model": model,
            "prompt_version": (
                PLANNED_PROMPT_VERSION if planned_scenario else PROMPT_VERSION
            ),
            "usage": {
                "drafting": None,
                "evaluation": review.get("usage", []),
                "drafting_usage_note": "Modellens tokenforbrug er ikke tilgængeligt i denne import.",
            },
        },
        pack["sources"],
        assessment_id=new_id,
        created_at=now,
        case_db_id=pack["case_db_id"],
        limitations=[
            *pack["limitations"],
            (
                f"Udkast udarbejdet med {model_label(model)}; kvalitetstjek ved JEV."
                if planned_scenario
                else f"Testudkast udarbejdet med {model_label(model)}; kvalitetstjek ved JEV."
            ),
            (
                "Modeloplysningen er registreret ved import af udkastet."
                if planned_scenario
                else "Modeloplysningen er registreret ved import af testudkastet."
            ),
        ],
    )
    generated.ai_generation.update(provenance)
    generated.ai_generation["generated_by"] = provider
    try:
        if db.get_bind().dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        else:
            db.query(Case).filter(Case.id == pack["case_db_id"]).with_for_update().one()
        db.expire_all()
        check_pack(db, pack, allowed_completed_id=new_id)
        previous = already_saved()
        if previous:
            db.rollback()
            return previous
        saved = save_assessment(
            db,
            assessment_id=new_id,
            created_at=now,
            request_payload=pack["request"],
            result_payload=generated.model_dump(mode="json"),
            case_db_id=pack["case_db_id"],
        )
        receipt = {
            "assessment_id": saved.id,
            "case_db_id": saved.case_db_id,
            "version": saved.version,
            "already_saved": False,
            "model": model,
            "evaluator_model": review["model"],
            "review_checks": len(review["checks"]),
        }
        db.commit()
        return receipt
    except Exception:
        db.rollback()
        raise


def read_json(path: Path, *, max_bytes: int = MAX_FILE_BYTES) -> dict:
    if path.stat().st_size > max_bytes:
        raise ValueError("Filen overskrider størrelsesgrænsen.")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Filen skal indeholde et JSON-objekt.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "data/shield-review.db")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--assessment-id", required=True)
    prepare.add_argument("--expected-name", required=True)
    prepare.add_argument(
        "--planned-scenario",
        action="store_true",
        help="Eksplicit opt-in for en brugerautoriseret, planlagt kommunal anvendelse med almindeligt navn.",
    )
    prepare.add_argument("--output", type=Path, required=True)
    importer = commands.add_parser("import")
    importer.add_argument("--source-pack", type=Path, required=True)
    importer.add_argument("--draft", type=Path, required=True)
    importer.add_argument("--model", choices=sorted(ALLOWED_MODELS), required=True)
    importer.add_argument("--run-id", required=True)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error("Den lokale database findes ikke.")
    engine = create_engine(f"sqlite:///{args.database.resolve()}")
    try:
        with Session(engine) as db:
            if args.command == "prepare":
                pack = prepare_pack(
                    db,
                    args.assessment_id,
                    args.expected_name,
                    planned_scenario=args.planned_scenario,
                )
                args.output.parent.mkdir(parents=True, exist_ok=True)
                with args.output.open("x", encoding="utf-8") as handle:
                    json.dump(
                        pack, handle, ensure_ascii=False, indent=2, allow_nan=False
                    )
                args.output.chmod(0o444)
                receipt = {
                    "source_pack": str(args.output),
                    "source_pack_sha256": pack["source_pack_sha256"],
                    "assessment_id": pack["assessment_id"],
                }
            else:
                receipt = import_draft(
                    db,
                    read_json(args.source_pack, max_bytes=MAX_SOURCE_PACK_FILE_BYTES),
                    read_json(args.draft),
                    model=args.model,
                    run_id=args.run_id,
                )
        print(json.dumps(receipt, ensure_ascii=False))
        return 0
    except (ValueError, InvalidAIDraft, AIGenerationUnavailable) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        # Database/worker exceptions may contain payloads. Never dump them.
        print("Importen stoppede sikkert. Ingen ny analyse er gemt.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
