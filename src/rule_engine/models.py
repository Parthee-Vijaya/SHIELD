"""Pydantic models for the Tyr rule structure.

Mirrors the JSON Schema in /rules/_schema.json. Pydantic validates types
and pattern constraints; jsonschema in `loader.py` validates the YAML
against the canonical schema first as a stronger guarantee for human-edited
rule files.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class Status(str, Enum):
    GO = "GO"
    BETINGET_GO = "BETINGET-GO"
    NO_GO = "NO-GO"


class PredicateType(str, Enum):
    BOOLEAN = "boolean"
    ENUM = "enum"
    TEXT = "text"
    NUMBER = "number"


class LawSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lov: str = Field(min_length=3)
    artikel: str = Field(min_length=1)
    citat: str = Field(min_length=10)
    url: HttpUrl
    sidst_verificeret: date


class TriggerCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal: str = Field(pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")


class Trigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    any_of: list[TriggerCondition] | None = None
    all_of: list[TriggerCondition] | None = None

    @field_validator("any_of", "all_of")
    @classmethod
    def _at_least_one_item(cls, v: list[TriggerCondition] | None) -> list[TriggerCondition] | None:
        if v is not None and len(v) < 1:
            raise ValueError("trigger arrays must have at least one item")
        return v

    def model_post_init(self, __context: Any) -> None:
        if self.any_of is None and self.all_of is None:
            raise ValueError("trigger must define any_of or all_of")


class Predicate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    spørgsmål: str = Field(min_length=5, alias="spørgsmål")
    type: PredicateType
    enum_values: list[str] | None = None
    hjælp: str | None = Field(default=None, alias="hjælp")

    def model_post_init(self, __context: Any) -> None:
        if self.type == PredicateType.ENUM:
            if not self.enum_values or len(self.enum_values) < 2:
                raise ValueError(
                    f"predicate '{self.id}' is type=enum but enum_values has <2 entries"
                )


class RuleOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Status
    krav: list[str] = Field(default_factory=list)
    evidens_påkrævet: list[str] = Field(default_factory=list, alias="evidens_påkrævet")
    begrundelse: str | None = None


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    hvis: str = Field(min_length=1)
    så: RuleOutcome = Field(alias="så")
    ellers: RuleOutcome | None = None


class LLMInterpretation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rolle: str = Field(min_length=10)
    prompt_template: str = Field(min_length=10)


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(pattern=r"^[a-z0-9_]+(\.[a-z0-9_]+){2,}$")
    kilde: LawSource
    trigger: Trigger
    predikater: list[Predicate] = Field(min_length=1)
    afgørelse: Decision = Field(alias="afgørelse")
    llm_fortolkning: LLMInterpretation | None = None
    metadata: dict[str, Any] | None = None

    def predicate_ids(self) -> set[str]:
        return {p.id for p in self.predikater}

    def predicate_by_id(self, pid: str) -> Predicate | None:
        for p in self.predikater:
            if p.id == pid:
                return p
        return None


class RuleInput(BaseModel):
    """Input to evaluate a single rule: signal values + predicate answers.

    Signals are typically extracted from free text (LLM-assisted via
    `signal_extractor`); predicate answers come from the assessor's form input.
    """

    model_config = ConfigDict(extra="forbid")

    signals: dict[str, bool] = Field(default_factory=dict)
    predicates: dict[str, bool | str | int | float] = Field(default_factory=dict)


class RuleDecision(BaseModel):
    """Result of evaluating one rule against `RuleInput`.

    `needs_input` lists predicate ids the rule referenced but the caller
    did not provide. When non-empty, `status` will be None — the rule
    cannot decide until the missing answers come in.
    """

    model_config = ConfigDict(extra="forbid")

    rule_id: str
    triggered: bool
    status: Status | None = None
    outcome: RuleOutcome | None = None
    kilde: LawSource
    needs_input: list[str] = Field(default_factory=list)
    evaluation_log: list[str] = Field(default_factory=list)
