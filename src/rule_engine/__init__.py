"""Tyr rule engine — declarative compliance rules backed by law citations.

Rules live in /rules as YAML files, one per legal article. Each rule carries
its source citation (lov, artikel, citat, url, sidst_verificeret), trigger
signals, predicates the assessor must answer, and a deterministic decision
expression that maps predicate answers to GO / BETINGET-GO / NO-GO.

LLM is allowed only in `signal_extractor` to interpret free-text input into
structured signals. The decision itself is always deterministic.
"""

from src.rule_engine.models import (
    LawSource,
    Predicate,
    Rule,
    RuleDecision,
    RuleInput,
    RuleOutcome,
    Status,
    TriggerCondition,
)
from src.rule_engine.executor import RuleExecutor, evaluate_rule
from src.rule_engine.loader import RuleLoader, load_rules
from src.rule_engine.signal_extractor import (
    SignalExtractionError,
    SignalExtractor,
)

__all__ = [
    "LawSource",
    "Predicate",
    "Rule",
    "RuleDecision",
    "RuleInput",
    "RuleOutcome",
    "Status",
    "TriggerCondition",
    "RuleExecutor",
    "evaluate_rule",
    "RuleLoader",
    "load_rules",
    "SignalExtractor",
    "SignalExtractionError",
]
