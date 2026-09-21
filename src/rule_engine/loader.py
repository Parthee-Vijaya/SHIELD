"""Load rule files from disk: YAML → JSON Schema validation → Pydantic Rule.

Layout assumption: rules live under a directory tree where each YAML file
is one rule. The schema file `_schema.json` is sibling to the rule
folders. Filenames starting with `_` are reserved and skipped.

Usage:

    from src.rule_engine.loader import RuleLoader
    rules = RuleLoader("rules").load_all()

The loader also performs static cross-checks beyond JSON Schema: every
identifier referenced in a rule's decision expression must have a matching
predicate definition.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import yaml
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from src.rule_engine.expression import ExpressionError, parse, referenced_idents
from src.rule_engine.models import Rule


class RuleLoadError(Exception):
    """Raised when a rule file cannot be loaded or fails validation."""

    def __init__(self, path: Path, message: str):
        self.path = path
        self.message = message
        super().__init__(f"{path}: {message}")


@dataclass
class LoadResult:
    rules: list[Rule] = field(default_factory=list)
    errors: list[RuleLoadError] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


class RuleLoader:
    def __init__(self, rules_dir: str | Path):
        self.rules_dir = Path(rules_dir)
        if not self.rules_dir.is_dir():
            raise FileNotFoundError(f"rules directory not found: {self.rules_dir}")

        schema_path = self.rules_dir / "_schema.json"
        if not schema_path.is_file():
            raise FileNotFoundError(f"_schema.json not found in {self.rules_dir}")
        with schema_path.open("r", encoding="utf-8") as f:
            self._schema = json.load(f)
        self._validator = Draft202012Validator(self._schema)

    def _iter_rule_files(self) -> Iterable[Path]:
        for path in sorted(self.rules_dir.rglob("*.yaml")):
            if path.name.startswith("_"):
                continue
            yield path

    def _load_one(self, path: Path) -> Rule:
        with path.open("r", encoding="utf-8") as f:
            try:
                raw = yaml.safe_load(f)
            except yaml.YAMLError as exc:
                raise RuleLoadError(path, f"YAML parse error: {exc}") from exc

        if not isinstance(raw, dict):
            raise RuleLoadError(path, "rule file must be a YAML mapping at top level")

        schema_errors = sorted(self._validator.iter_errors(raw), key=lambda e: list(e.path))
        if schema_errors:
            messages = []
            for err in schema_errors:
                where = "/".join(str(p) for p in err.absolute_path) or "<root>"
                messages.append(f"  at {where}: {err.message}")
            raise RuleLoadError(path, "schema violations:\n" + "\n".join(messages))

        try:
            rule = Rule.model_validate(raw)
        except ValidationError as exc:
            raise RuleLoadError(path, f"pydantic validation: {exc}") from exc

        try:
            expr = parse(rule.afgørelse.hvis)
        except ExpressionError as exc:
            raise RuleLoadError(path, f"decision expression parse error: {exc}") from exc

        defined = rule.predicate_ids()
        referenced = set(referenced_idents(expr))
        missing = referenced - defined
        if missing:
            raise RuleLoadError(
                path,
                f"decision expression references undefined predicate(s): {sorted(missing)}",
            )

        return rule

    def load_all(self, raise_on_error: bool = False) -> LoadResult:
        result = LoadResult()
        seen_ids: dict[str, Path] = {}
        for path in self._iter_rule_files():
            try:
                rule = self._load_one(path)
            except RuleLoadError as exc:
                if raise_on_error:
                    raise
                result.errors.append(exc)
                continue
            if rule.id in seen_ids:
                err = RuleLoadError(
                    path,
                    f"duplicate rule id '{rule.id}' (also defined in {seen_ids[rule.id]})",
                )
                if raise_on_error:
                    raise err
                result.errors.append(err)
                continue
            seen_ids[rule.id] = path
            result.rules.append(rule)
        return result


def load_rules(rules_dir: str | Path = "rules") -> list[Rule]:
    """Convenience entry point: load all rules, raise on any error."""
    result = RuleLoader(rules_dir).load_all(raise_on_error=True)
    return result.rules
