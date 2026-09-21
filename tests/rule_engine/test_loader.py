"""Loader tests: schema validation, expression cross-check, duplicate detection."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from src.rule_engine.loader import RuleLoader, RuleLoadError

REAL_RULES_DIR = Path(__file__).resolve().parents[2] / "rules"


def test_load_all_pilot_rules_succeeds():
    result = RuleLoader(REAL_RULES_DIR).load_all(raise_on_error=False)
    assert result.ok, f"unexpected errors: {[str(e) for e in result.errors]}"
    assert len(result.rules) >= 3
    ids = {r.id for r in result.rules}
    assert "ai_act.art6.hojrisiko_klassifikation" in ids
    assert "gdpr.art22.automatiseret_individuel_afgorelse" in ids
    assert "forvaltningsloven.par22.begrundelsespligt" in ids


@pytest.fixture
def isolated_rules_dir(tmp_path: Path) -> Path:
    """Copy the schema into a clean rules dir so we can drop test fixtures
    without affecting the real rules."""
    target = tmp_path / "rules"
    target.mkdir()
    shutil.copy(REAL_RULES_DIR / "_schema.json", target / "_schema.json")
    return target


def test_schema_violation_is_reported(isolated_rules_dir):
    bad_rule = isolated_rules_dir / "bad.yaml"
    bad_rule.write_text(
        """
id: bad.rule.no_kilde
trigger:
  any_of:
    - signal: x.y
predikater:
  - id: a
    spørgsmål: "Test?"
    type: boolean
afgørelse:
  hvis: a
  så:
    status: GO
""".lstrip(),
        encoding="utf-8",
    )
    result = RuleLoader(isolated_rules_dir).load_all()
    assert not result.ok
    assert any("kilde" in str(e) for e in result.errors)


def test_undefined_predicate_in_expression_is_caught(isolated_rules_dir):
    rule = isolated_rules_dir / "undef.yaml"
    rule.write_text(
        """
id: test.rule.undef
kilde:
  lov: "Testlov"
  artikel: "§1"
  citat: "Lorem ipsum dolor sit amet"
  url: "https://example.com"
  sidst_verificeret: "2026-05-07"
trigger:
  any_of:
    - signal: x.y
predikater:
  - id: a
    spørgsmål: "Test?"
    type: boolean
afgørelse:
  hvis: a AND missing_predicate
  så:
    status: GO
""".lstrip(),
        encoding="utf-8",
    )
    result = RuleLoader(isolated_rules_dir).load_all()
    assert not result.ok
    assert any("missing_predicate" in str(e) for e in result.errors)


def test_duplicate_id_is_caught(isolated_rules_dir):
    yaml_body = """
id: test.rule.duplicate
kilde:
  lov: "Testlov"
  artikel: "§1"
  citat: "Lorem ipsum dolor sit amet"
  url: "https://example.com"
  sidst_verificeret: "2026-05-07"
trigger:
  any_of:
    - signal: x.y
predikater:
  - id: a
    spørgsmål: "Test?"
    type: boolean
afgørelse:
  hvis: a
  så:
    status: GO
""".lstrip()
    (isolated_rules_dir / "first.yaml").write_text(yaml_body, encoding="utf-8")
    (isolated_rules_dir / "second.yaml").write_text(yaml_body, encoding="utf-8")
    result = RuleLoader(isolated_rules_dir).load_all()
    assert not result.ok
    assert any("duplicate rule id" in str(e) for e in result.errors)


def test_missing_schema_raises():
    with pytest.raises(FileNotFoundError):
        RuleLoader("/tmp/nonexistent_rules_dir_for_test")


def test_underscore_files_are_skipped(isolated_rules_dir):
    """Files starting with _ (like _draft.yaml) should not be loaded as rules."""
    (isolated_rules_dir / "_draft.yaml").write_text("not: a rule\n", encoding="utf-8")
    result = RuleLoader(isolated_rules_dir).load_all()
    assert result.ok
    assert len(result.rules) == 0
