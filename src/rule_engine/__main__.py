"""CLI entry point for the rule engine.

Usage:
    python -m src.rule_engine validate [rules_dir]
    python -m src.rule_engine list [rules_dir]
    python -m src.rule_engine evaluate <rule_id> <input.json> [rules_dir]

Both `validate` and `list` default `rules_dir` to "rules".

`evaluate` takes a rule id (e.g. gdpr.art22.automatiseret_individuel_afgorelse)
and a JSON file with the shape `{"signals": {...}, "predicates": {...}}`,
prints the resulting decision as JSON to stdout, and exits 0.

Exit codes:
    0  success / all rules valid / decision rendered
    1  validation or evaluation failure
    2  CLI usage error
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from src.rule_engine.executor import RuleExecutor, RuleExecutionError
from src.rule_engine.loader import RuleLoader
from src.rule_engine.models import RuleInput


def _cmd_validate(rules_dir: str) -> int:
    loader = RuleLoader(rules_dir)
    result = loader.load_all(raise_on_error=False)
    print(f"Loaded {len(result.rules)} rule(s) from {Path(rules_dir).resolve()}")
    if result.errors:
        print(f"\n{len(result.errors)} error(s):", file=sys.stderr)
        for err in result.errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    for rule in result.rules:
        print(f"  ok  {rule.id}  ({rule.kilde.lov} {rule.kilde.artikel})")
    return 0


def _cmd_list(rules_dir: str) -> int:
    loader = RuleLoader(rules_dir)
    result = loader.load_all(raise_on_error=False)
    if result.errors:
        for err in result.errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1
    for rule in result.rules:
        print(f"{rule.id}")
        print(f"  lov:        {rule.kilde.lov}")
        print(f"  artikel:    {rule.kilde.artikel}")
        print(f"  url:        {rule.kilde.url}")
        print(f"  verificeret:{rule.kilde.sidst_verificeret}")
        print(f"  predikater: {len(rule.predikater)}")
        print()
    return 0


def _cmd_evaluate(rule_id: str, input_path: str, rules_dir: str) -> int:
    loader = RuleLoader(rules_dir)
    result = loader.load_all(raise_on_error=False)
    if result.errors:
        for err in result.errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1

    target = next((r for r in result.rules if r.id == rule_id), None)
    if target is None:
        print(f"Rule id not found: {rule_id}", file=sys.stderr)
        print("Available ids:", file=sys.stderr)
        for r in result.rules:
            print(f"  - {r.id}", file=sys.stderr)
        return 1

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read input JSON: {exc}", file=sys.stderr)
        return 1

    rule_input = RuleInput.model_validate(payload)

    try:
        decision = RuleExecutor(target).evaluate(rule_input)
    except RuleExecutionError as exc:
        print(f"Evaluation error: {exc}", file=sys.stderr)
        return 1

    print(decision.model_dump_json(indent=2))
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__, file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == "validate":
        rules_dir = argv[2] if len(argv) > 2 else "rules"
        return _cmd_validate(rules_dir)
    if cmd == "list":
        rules_dir = argv[2] if len(argv) > 2 else "rules"
        return _cmd_list(rules_dir)
    if cmd == "evaluate":
        if len(argv) < 4:
            print("Usage: python -m src.rule_engine evaluate <rule_id> <input.json> [rules_dir]", file=sys.stderr)
            return 2
        rule_id = argv[2]
        input_path = argv[3]
        rules_dir = argv[4] if len(argv) > 4 else "rules"
        return _cmd_evaluate(rule_id, input_path, rules_dir)
    print(f"Unknown command: {cmd}", file=sys.stderr)
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
