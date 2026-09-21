"""Local Codex source-pack/import bridge; credentials are only loaded by Node."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from src.services.analysis_limits import MAX_RAW_INPUT_CHARS  # noqa: E402
from src.services.procurement_analysis import (  # noqa: E402
    ALLOWED_CODEX_MODELS,
    MaterialAnalysisError,
    MaterialDraft,
    import_codex_analysis,
    prepare_source_pack,
)


def read_json(path: Path, *, max_bytes: int = 2_000_000):
    if path.stat().st_size > max_bytes:
        raise MaterialAnalysisError("Filen er for stor.")
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        type=Path,
        required=True,
        help="Existing SQLite database; never an environment file.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--case-id", required=True)
    prepare.add_argument("--output", type=Path, required=True)
    prepare.add_argument("--schema", type=Path)
    importer = commands.add_parser("import")
    importer.add_argument("--source-pack", type=Path, required=True)
    importer.add_argument("--draft", type=Path, required=True)
    importer.add_argument(
        "--model", choices=sorted(ALLOWED_CODEX_MODELS), required=True
    )
    importer.add_argument("--run-id", required=True)
    args = parser.parse_args()
    if not args.db.is_file() or args.db.suffix not in {".db", ".sqlite", ".sqlite3"}:
        parser.error("Angiv en eksisterende SQLite-database.")
    engine = create_engine(f"sqlite:///{args.db.resolve()}")
    try:
        with Session(engine) as db:
            if args.command == "prepare":
                pack = prepare_source_pack(db, args.case_id)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                args.output.chmod(0o600)
                if args.schema:
                    args.schema.write_text(
                        json.dumps(
                            MaterialDraft.model_json_schema(),
                            ensure_ascii=False,
                            indent=2,
                        ),
                        encoding="utf-8",
                    )
                print(
                    json.dumps(
                        {
                            "case_id": args.case_id,
                            "sources": len(pack["sources"]),
                            "source_pack": str(args.output),
                        }
                    )
                )
            else:
                result = import_codex_analysis(
                    db,
                    read_json(args.source_pack, max_bytes=MAX_RAW_INPUT_CHARS * 4),
                    read_json(args.draft),
                    model=args.model,
                    run_id=args.run_id,
                )
                print(
                    json.dumps(
                        {
                            "case_id": result["case_id"],
                            "analysis_id": result["id"],
                            "model": result["model"],
                            "facts": len(result["facts"]),
                            "review_checks": len(result["review"]["checks"]),
                        }
                    )
                )
    except (MaterialAnalysisError, ValueError, OSError):
        # No provider/raw-document details escape through CLI error output.
        print(
            "Kildematerialet eller AI-kontrollen kunne ikke valideres; ingen ny analyse er gemt.",
            file=sys.stderr,
        )
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
