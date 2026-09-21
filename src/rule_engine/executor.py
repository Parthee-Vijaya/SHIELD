"""Evaluate a single rule (or a list of rules) against a `RuleInput`.

The executor is intentionally pure-Python and synchronous. The only
external surface is signal extraction, which is *not* called here — call
`signal_extractor` separately and pass results into `RuleInput.signals`.

This separation is what makes the rule engine deterministic and auditable:
the LLM's role is bounded to translating fuzzy text into a finite set of
named signals, and never participates in the decision itself.
"""

from __future__ import annotations

from src.rule_engine.expression import (
    ExpressionError,
    evaluate,
    parse,
    referenced_idents,
)
from src.rule_engine.models import (
    Predicate,
    PredicateType,
    Rule,
    RuleDecision,
    RuleInput,
    Status,
    Trigger,
)


class RuleExecutionError(Exception):
    pass


def _trigger_matches(trigger: Trigger, signals: dict[str, bool]) -> bool:
    if trigger.any_of is not None:
        return any(signals.get(c.signal, False) for c in trigger.any_of)
    if trigger.all_of is not None:
        return all(signals.get(c.signal, False) for c in trigger.all_of)
    raise RuleExecutionError("trigger has neither any_of nor all_of (model invariant violated)")


def _coerce_predicate_value(predicate: Predicate, raw: bool | str | int | float) -> bool | str:
    if predicate.type == PredicateType.BOOLEAN:
        if not isinstance(raw, bool):
            raise RuleExecutionError(
                f"predicate '{predicate.id}' is boolean but got {type(raw).__name__}: {raw!r}"
            )
        return raw
    if predicate.type == PredicateType.ENUM:
        if not isinstance(raw, str):
            raise RuleExecutionError(
                f"predicate '{predicate.id}' is enum but got {type(raw).__name__}: {raw!r}"
            )
        if predicate.enum_values and raw not in predicate.enum_values:
            raise RuleExecutionError(
                f"predicate '{predicate.id}' value {raw!r} not in enum {predicate.enum_values}"
            )
        return raw
    raise RuleExecutionError(
        f"predicate '{predicate.id}' has unsupported type {predicate.type} for decision expressions"
    )


class RuleExecutor:
    def __init__(self, rule: Rule):
        self.rule = rule
        try:
            self._expr = parse(rule.afgørelse.hvis)
        except ExpressionError as exc:
            raise RuleExecutionError(
                f"rule '{rule.id}': decision expression invalid: {exc}"
            ) from exc
        self._referenced = set(referenced_idents(self._expr))
        missing = self._referenced - rule.predicate_ids()
        if missing:
            raise RuleExecutionError(
                f"rule '{rule.id}': decision expression references undefined predicate(s) {sorted(missing)}"
            )

    def evaluate(self, rule_input: RuleInput) -> RuleDecision:
        log: list[str] = []

        triggered = _trigger_matches(self.rule.trigger, rule_input.signals)
        log.append(f"trigger matched: {triggered}")
        if not triggered:
            return RuleDecision(
                rule_id=self.rule.id,
                triggered=False,
                status=None,
                outcome=None,
                kilde=self.rule.kilde,
                evaluation_log=log,
            )

        context: dict[str, bool | str | int | float] = {}
        missing: list[str] = []
        for pid in self._referenced:
            predicate = self.rule.predicate_by_id(pid)
            if predicate is None:
                raise RuleExecutionError(
                    f"rule '{self.rule.id}': internal error: predicate '{pid}' missing"
                )
            if pid not in rule_input.predicates:
                missing.append(pid)
                continue
            context[pid] = _coerce_predicate_value(predicate, rule_input.predicates[pid])

        if missing:
            log.append(f"missing predicate answers: {sorted(missing)}")
            return RuleDecision(
                rule_id=self.rule.id,
                triggered=True,
                status=None,
                outcome=None,
                kilde=self.rule.kilde,
                needs_input=sorted(missing),
                evaluation_log=log,
            )

        condition = evaluate(self._expr, context)
        log.append(f"decision expression evaluated to: {condition}")

        if condition:
            outcome = self.rule.afgørelse.så
            log.append(f"matched 'så' branch -> {outcome.status}")
        elif self.rule.afgørelse.ellers is not None:
            outcome = self.rule.afgørelse.ellers
            log.append(f"matched 'ellers' branch -> {outcome.status}")
        else:
            log.append("expression false and no 'ellers' branch -> rule does not apply")
            return RuleDecision(
                rule_id=self.rule.id,
                triggered=True,
                status=None,
                outcome=None,
                kilde=self.rule.kilde,
                evaluation_log=log,
            )

        return RuleDecision(
            rule_id=self.rule.id,
            triggered=True,
            status=outcome.status,
            outcome=outcome,
            kilde=self.rule.kilde,
            evaluation_log=log,
        )


def evaluate_rule(rule: Rule, rule_input: RuleInput) -> RuleDecision:
    return RuleExecutor(rule).evaluate(rule_input)


def evaluate_all(rules: list[Rule], rule_input: RuleInput) -> list[RuleDecision]:
    """Evaluate every rule against the same input. Returns one decision per
    rule (whether triggered or not)."""
    return [RuleExecutor(rule).evaluate(rule_input) for rule in rules]


def aggregate_status(decisions: list[RuleDecision]) -> Status:
    """Combine decisions into a single overall status using strict precedence:
    NO-GO > unresolved input > BETINGET-GO > GO.

    Missing predicate answers and an entirely non-conclusive run are never
    allowed to collapse to GO.  That would be a fail-open legal conclusion.
    """
    seen = [d.status for d in decisions if d.status is not None]
    if Status.NO_GO in seen:
        return Status.NO_GO
    if any(d.triggered and d.needs_input for d in decisions):
        return Status.BETINGET_GO
    if Status.BETINGET_GO in seen:
        return Status.BETINGET_GO
    if Status.GO in seen:
        return Status.GO
    return Status.BETINGET_GO
