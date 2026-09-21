"""Run four public-source demonstrations and persist their actual outcomes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.run_public_dpa_example import run, write_json  # noqa: E402


def run_portfolio(base_url: str, only: list[str] | None = None) -> list[dict]:
    profiles = json.loads(
        (ROOT / "examples/dpia/demo-portfolio.json").read_text(encoding="utf-8")
    )
    known_ids = {p["id"] for p in profiles}
    if only and not set(only).issubset(known_ids):
        raise ValueError("Ukendt eksempelsag")
    results = []
    for profile in profiles:
        if only and profile["id"] not in only:
            continue
        try:
            source_dir = ROOT / profile["source_dir"]
            manifest = json.loads(
                (source_dir / "manifest.json").read_text(encoding="utf-8")
            )
            example = {**profile, "fixture": ROOT / profile["fixture"]}
            if profile["vendor_id"] != "aicom" and not manifest.get("jev_claims"):
                raise ValueError("Leverandørens tre JEV-testpåstande mangler.")
            if manifest.get("jev_claims"):
                claims = manifest["jev_claims"]
                if (
                    len(claims) != 3
                    or not all(
                        type(c.get("expected_requires_review")) is bool for c in claims
                    )
                    or len({c.get("id") for c in claims}) != 3
                ):
                    raise ValueError("Ugyldig JEV-testdefinition")
                example["jev_claims"] = [
                    (c["id"], c["label"], c["text"], c["expected_requires_review"])
                    for c in claims
                ]
            args = SimpleNamespace(
                base_url=base_url,
                sources_dir=source_dir,
                output_dir=ROOT / ".cache/demo-portfolio" / profile["id"],
            )
            result = {"example_id": profile["id"], **run(args, example=example)}
        except Exception as exc:
            # Never expose remote errors, headers or potentially private input.
            result = {
                "example_id": profile["id"],
                "status": "failed",
                "error_type": type(exc).__name__,
            }
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    output_dir = ROOT / ".cache/demo-portfolio"
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "latest.json", results)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--only", nargs="+")
    options = parser.parse_args()
    try:
        results = run_portfolio(options.base_url, options.only)
        sys.exit(0 if results and all(r["status"] == "passed" for r in results) else 2)
    except Exception as exc:
        print(
            f"Demonstrationskørslen stoppede ({type(exc).__name__}).", file=sys.stderr
        )
        sys.exit(1)
