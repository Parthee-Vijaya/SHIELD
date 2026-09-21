"""Regression-test harness for the rule engine.

A regression case is a YAML or JSON file containing the same
`{signals, predicates}` shape that `RuleInput` accepts, plus an
`expected` block describing what the rule engine should produce.
The runner evaluates each case against all loaded rules and reports
pass/fail.

Use it as the safety net while we expand the rule corpus: the same
cases that worked yesterday must still work today, and the cases that
should produce specific decisions must continue to produce them.

Example case file (`tests/regression/cases.yaml`):

    - name: "Borgerassistent — pension"
      signals:
        system.uses_ai: true
        system.processes_personal_data: true
        ...
      predicates:
        anvendelse: intet_af_ovenstaaende
        ...
      expected:
        aggregate_status: BETINGET-GO
        triggered_rule_ids: [ai_act.art6.hojrisiko_klassifikation, gdpr.art22.automatiseret_individuel_afgorelse]
        rule_status:
          ai_act.art5.forbudte_praksisser: GO
          ai_act.art6.hojrisiko_klassifikation: BETINGET-GO

CLI:

    python -m src.rule_engine.regression tests/regression/cases.yaml [rules_dir]

Exit code 0 if all pass, 1 if any fail.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from src.rule_engine.executor import aggregate_status, evaluate_all
from src.rule_engine.loader import RuleLoader
from src.rule_engine.models import Rule, RuleInput, Status


@dataclass
class RegressionCase:
    name: str
    signals: dict[str, bool]
    predicates: dict[str, Any]
    expected_aggregate: Status | None = None
    expected_triggered: set[str] = field(default_factory=set)
    expected_not_triggered: set[str] = field(default_factory=set)
    expected_rule_status: dict[str, Status] = field(default_factory=dict)


@dataclass
class CaseResult:
    case: RegressionCase
    passed: bool
    failures: list[str] = field(default_factory=list)


def _parse_status(raw: str | None) -> Status | None:
    if raw is None:
        return None
    try:
        return Status(raw)
    except ValueError as exc:
        raise ValueError(f"unknown status value: {raw!r}") from exc


def load_cases(path: Path) -> list[RegressionCase]:
    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, list):
        raise ValueError(f"{path}: expected top-level list of cases, got {type(raw).__name__}")

    cases: list[RegressionCase] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or "name" not in item:
            raise ValueError(f"{path}#{i}: case must be a dict with 'name'")
        expected = item.get("expected", {}) or {}
        cases.append(
            RegressionCase(
                name=item["name"],
                signals=item.get("signals", {}) or {},
                predicates=item.get("predicates", {}) or {},
                expected_aggregate=_parse_status(expected.get("aggregate_status")),
                expected_triggered=set(expected.get("triggered_rule_ids", []) or []),
                expected_not_triggered=set(expected.get("not_triggered_rule_ids", []) or []),
                expected_rule_status={
                    k: Status(v) for k, v in (expected.get("rule_status") or {}).items()
                },
            )
        )
    return cases


def run_case(case: RegressionCase, rules: list[Rule]) -> CaseResult:
    failures: list[str] = []
    try:
        decisions = evaluate_all(
            rules,
            RuleInput(signals=case.signals, predicates=case.predicates),
        )
    except Exception as exc:
        return CaseResult(case=case, passed=False, failures=[f"evaluation crashed: {exc}"])

    by_id = {d.rule_id: d for d in decisions}
    triggered = {d.rule_id for d in decisions if d.triggered}

    if case.expected_aggregate is not None:
        actual = aggregate_status(decisions)
        if actual != case.expected_aggregate:
            failures.append(
                f"aggregate_status: expected {case.expected_aggregate.value}, got {actual.value}"
            )

    missing = case.expected_triggered - triggered
    if missing:
        failures.append(f"expected rules to trigger but did not: {sorted(missing)}")

    unexpected = case.expected_not_triggered & triggered
    if unexpected:
        failures.append(f"expected rules NOT to trigger but did: {sorted(unexpected)}")

    for rule_id, expected_status in case.expected_rule_status.items():
        if rule_id not in by_id:
            failures.append(f"expected status for unknown rule '{rule_id}'")
            continue
        actual_status = by_id[rule_id].status
        if actual_status != expected_status:
            failures.append(
                f"{rule_id}: expected {expected_status.value}, got "
                f"{actual_status.value if actual_status else 'None (not triggered)'}"
            )

    return CaseResult(case=case, passed=not failures, failures=failures)


def run_all(cases: list[RegressionCase], rules: list[Rule]) -> list[CaseResult]:
    return [run_case(c, rules) for c in cases]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("cases_file", type=Path, help="YAML or JSON file of regression cases")
    parser.add_argument("rules_dir", type=Path, default=Path("rules"), nargs="?")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    rules_loaded = RuleLoader(args.rules_dir).load_all(raise_on_error=False)
    if not rules_loaded.ok:
        print(f"Rule load errors:", file=sys.stderr)
        for err in rules_loaded.errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    cases = load_cases(args.cases_file)
    results = run_all(cases, rules_loaded.rules)

    failed = [r for r in results if not r.passed]
    for r in results:
        marker = "PASS" if r.passed else "FAIL"
        print(f"{marker}  {r.case.name}")
        if not r.passed or args.verbose:
            for failure in r.failures:
                print(f"        {failure}")

    print()
    print(f"{len(results) - len(failed)}/{len(results)} cases passed")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
