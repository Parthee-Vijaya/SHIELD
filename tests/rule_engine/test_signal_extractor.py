"""Tests for the signal extractor.

We never call a real LLM in tests — instead we pass a stub `invoke`
that returns canned content. This is enough to verify all the parsing,
normalization, and rule-scoping logic.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.rule_engine.loader import RuleLoader
from src.rule_engine.signal_extractor import (
    SignalExtractionError,
    SignalExtractor,
    _default_llm,
    _normalize_value,
    _parse_llm_json,
    _signals_for_rule,
)

RULES_DIR = Path(__file__).resolve().parents[2] / "rules"


@pytest.fixture(scope="module")
def rules_by_id():
    result = RuleLoader(RULES_DIR).load_all(raise_on_error=True)
    return {r.id: r for r in result.rules}


@dataclass
class StubLLM:
    """Minimal LLM stub. Returns the content string passed at construction."""
    content: str

    def invoke(self, prompt: str) -> object:
        return type("AIMessage", (), {"content": self.content})()


class TestSignalsForRule:
    def test_extracts_any_of_signals(self, rules_by_id):
        rule = rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"]
        signals = _signals_for_rule(rule)
        assert "system.makes_decisions_about_persons" in signals
        assert "system.classifies_individuals" in signals


class TestNormalizeValue:
    @pytest.mark.parametrize("raw,expected", [
        (True, True),
        (False, False),
        ("true", True),
        ("True", True),
        ("ja", True),
        ("yes", True),
        ("1", True),
        ("false", False),
        ("nej", False),
        ("no", False),
        ("0", False),
        ("usikker", "usikker"),
        ("unknown", "usikker"),
        ("maybe", "usikker"),
    ])
    def test_canonical_inputs(self, raw, expected):
        assert _normalize_value(raw) == expected

    @pytest.mark.parametrize("raw", ["nonsense", "", 42, None, [], {}])
    def test_unknown_returns_none(self, raw):
        assert _normalize_value(raw) is None


class TestParseLlmJson:
    def test_pulls_signals_from_clean_json(self):
        content = '{"system.foo": true, "system.bar": false}'
        out = _parse_llm_json(content, expected_signals={"system.foo", "system.bar"})
        assert out == {"system.foo": True, "system.bar": False}

    def test_extracts_json_from_surrounding_text(self):
        content = (
            "Here is my analysis:\n"
            '{"system.foo": true, "system.bar": "usikker"}\n'
            "Hope that helps!"
        )
        out = _parse_llm_json(content, expected_signals={"system.foo", "system.bar"})
        assert out == {"system.foo": True, "system.bar": "usikker"}

    def test_accepts_nested_form_of_expected_dotted_signals(self):
        content = '{"system": {"foo": true, "bar": false}}'
        out = _parse_llm_json(content, expected_signals={"system.foo", "system.bar"})
        assert out == {"system.foo": True, "system.bar": False}

    def test_drops_signals_not_in_expected_set(self):
        content = '{"system.foo": true, "system.malicious": true}'
        out = _parse_llm_json(content, expected_signals={"system.foo"})
        assert out == {"system.foo": True}
        assert "system.malicious" not in out

    def test_drops_uninterpretable_values(self):
        content = '{"system.foo": "garbage", "system.bar": true}'
        out = _parse_llm_json(content, expected_signals={"system.foo", "system.bar"})
        assert out == {"system.bar": True}

    def test_no_json_raises(self):
        with pytest.raises(SignalExtractionError, match="no JSON"):
            _parse_llm_json("just plain text", expected_signals={"x"})

    def test_invalid_json_raises(self):
        with pytest.raises(SignalExtractionError, match="not valid JSON"):
            _parse_llm_json("{not: valid}", expected_signals={"x"})

    def test_array_json_raises_no_json_object(self):
        # Our regex only matches `{...}`, so an array gets reported as
        # "no JSON object" rather than "not an object".
        with pytest.raises(SignalExtractionError, match="no JSON"):
            _parse_llm_json('["foo", "bar"]', expected_signals={"x"})


class TestExtractor:
    def test_local_provider_can_require_json_mode(self, monkeypatch):
        class FakeChatOpenAI:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                self.bind_kwargs = None

            def bind(self, **kwargs):
                self.bind_kwargs = kwargs
                return self

            def invoke(self, prompt: str) -> object:
                return type("AIMessage", (), {"content": '{"system.x": true}'})()

        monkeypatch.setitem(
            sys.modules,
            "langchain_openai",
            SimpleNamespace(ChatOpenAI=FakeChatOpenAI, AzureChatOpenAI=FakeChatOpenAI),
        )
        monkeypatch.setenv("LM_STUDIO_BASE_URL", "http://localhost:11434/v1")
        monkeypatch.setenv("LM_STUDIO_MODEL", "llama3.2:3b")
        monkeypatch.setenv("LM_STUDIO_JSON_MODE", "true")

        client = _default_llm()

        assert client.bind_kwargs == {"response_format": {"type": "json_object"}}

    def test_returns_empty_when_no_llm_configured(self, rules_by_id):
        extractor = SignalExtractor(llm=None)
        assert not extractor.is_configured
        assert extractor.extract_for_rule("anything", rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"]) == {}

    def test_returns_empty_for_rule_without_llm_fortolkning(self):
        # All our pilot rules have llm_fortolkning, so we synthesize one without it
        from src.rule_engine.models import (
            LawSource,
            Predicate,
            PredicateType,
            Rule,
            Trigger,
            TriggerCondition,
            Decision,
            RuleOutcome,
            Status,
        )
        rule = Rule(
            id="test.rule.nollm",
            kilde=LawSource(
                lov="Testlov",
                artikel="§ 1",
                citat="Lorem ipsum dolor sit amet",
                url="https://example.com",
                sidst_verificeret="2026-05-07",
            ),
            trigger=Trigger(any_of=[TriggerCondition(signal="system.x")]),
            predikater=[Predicate(id="p", **{"spørgsmål": "Test?"}, type=PredicateType.BOOLEAN)],
            **{"afgørelse": Decision(hvis="p", **{"så": RuleOutcome(status=Status.GO)})},
        )
        extractor = SignalExtractor(llm=StubLLM('{"system.x": true}'))
        assert extractor.extract_for_rule("desc", rule) == {}

    def test_extract_for_rule_returns_signals(self, rules_by_id):
        rule = rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"]
        stub = StubLLM(
            '{"system.makes_decisions_about_persons": true, '
            '"system.classifies_individuals": false, '
            '"system.scores_or_ranks_persons": "usikker"}'
        )
        extractor = SignalExtractor(llm=stub)
        out = extractor.extract_for_rule("Borgerassistent...", rule)
        # 'usikker' is dropped, only definite booleans propagate
        assert out == {
            "system.makes_decisions_about_persons": True,
            "system.classifies_individuals": False,
        }

    def test_extract_across_multiple_rules_merges(self, rules_by_id):
        rules = [
            rules_by_id["ai_act.art6.hojrisiko_klassifikation"],
            rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"],
        ]
        stub = StubLLM(
            '{"system.uses_ai": true, '
            '"system.makes_decisions_about_persons": true, '
            '"system.classifies_individuals": false, '
            '"system.scores_or_ranks_persons": false}'
        )
        extractor = SignalExtractor(llm=stub)
        out = extractor.extract("Borgerassistent...", rules)
        assert out["system.uses_ai"] is True
        assert out["system.makes_decisions_about_persons"] is True
        assert out["system.classifies_individuals"] is False

    def test_llm_cannot_inject_unexpected_signals(self, rules_by_id):
        rule = rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"]
        stub = StubLLM(
            '{"system.makes_decisions_about_persons": true, '
            '"system.unknown_signal_from_attacker": true}'
        )
        extractor = SignalExtractor(llm=stub)
        out = extractor.extract_for_rule("...", rule)
        assert "system.unknown_signal_from_attacker" not in out

    def test_llm_invocation_error_propagates_as_signalextraction_error(self, rules_by_id):
        class BoomLLM:
            def invoke(self, prompt: str) -> object:
                raise RuntimeError("API down")

        rule = rules_by_id["gdpr.art22.automatiseret_individuel_afgorelse"]
        extractor = SignalExtractor(llm=BoomLLM())
        with pytest.raises(SignalExtractionError, match="LLM invocation failed"):
            extractor.extract_for_rule("...", rule)
