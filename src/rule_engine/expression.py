"""Boolean expression parser and evaluator for rule decision logic.

Supports a small, intentionally constrained language so jurists can write
rule expressions safely without `eval`. Grammar (informal):

    expr       := or_expr
    or_expr    := and_expr ('OR' and_expr)*
    and_expr   := not_expr ('AND' not_expr)*
    not_expr   := 'NOT' not_expr | atom_or_cmp
    atom_or_cmp:= atom (('==' | '!=') value)?
    atom       := '(' expr ')' | IDENT
    value      := IDENT          # bareword enum value

Operators are case-sensitive uppercase: AND, OR, NOT.
Identifiers match `[a-z][a-z0-9_]*`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterator

_TOKEN_RE = re.compile(
    r"""
    \s+                |        # whitespace (skipped)
    (?P<LPAREN>\()     |
    (?P<RPAREN>\))     |
    (?P<EQ>==)         |
    (?P<NEQ>!=)        |
    (?P<IDENT>[a-zA-Z_][a-zA-Z0-9_]*)
    """,
    re.VERBOSE,
)

_KEYWORDS = {"AND", "OR", "NOT"}


@dataclass(frozen=True)
class Token:
    kind: str
    value: str
    pos: int


class ExpressionError(ValueError):
    """Raised for any parse or evaluation error."""


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    pos = 0
    while pos < len(source):
        m = _TOKEN_RE.match(source, pos)
        if not m:
            raise ExpressionError(f"Unexpected character at pos {pos}: {source[pos]!r}")
        if m.group().isspace():
            pos = m.end()
            continue
        kind = m.lastgroup
        value = m.group()
        if kind == "IDENT" and value in _KEYWORDS:
            kind = value  # AND, OR, NOT become their own kinds
        tokens.append(Token(kind=kind, value=value, pos=pos))
        pos = m.end()
    tokens.append(Token(kind="EOF", value="", pos=pos))
    return tokens


# AST nodes ---------------------------------------------------------------


@dataclass(frozen=True)
class IdentExpr:
    name: str


@dataclass(frozen=True)
class CompareExpr:
    left: str
    op: str  # '==' or '!='
    right: str


@dataclass(frozen=True)
class NotExpr:
    inner: "Expr"


@dataclass(frozen=True)
class AndExpr:
    left: "Expr"
    right: "Expr"


@dataclass(frozen=True)
class OrExpr:
    left: "Expr"
    right: "Expr"


Expr = IdentExpr | CompareExpr | NotExpr | AndExpr | OrExpr


# Parser ------------------------------------------------------------------


class _Parser:
    def __init__(self, tokens: list[Token]):
        self._tokens = tokens
        self._pos = 0

    def _peek(self) -> Token:
        return self._tokens[self._pos]

    def _advance(self) -> Token:
        tok = self._tokens[self._pos]
        self._pos += 1
        return tok

    def _expect(self, kind: str) -> Token:
        tok = self._advance()
        if tok.kind != kind:
            raise ExpressionError(
                f"Expected {kind} at pos {tok.pos}, got {tok.kind} ({tok.value!r})"
            )
        return tok

    def parse(self) -> Expr:
        expr = self._parse_or()
        if self._peek().kind != "EOF":
            extra = self._peek()
            raise ExpressionError(
                f"Unexpected token at pos {extra.pos}: {extra.kind} ({extra.value!r})"
            )
        return expr

    def _parse_or(self) -> Expr:
        left = self._parse_and()
        while self._peek().kind == "OR":
            self._advance()
            right = self._parse_and()
            left = OrExpr(left, right)
        return left

    def _parse_and(self) -> Expr:
        left = self._parse_not()
        while self._peek().kind == "AND":
            self._advance()
            right = self._parse_not()
            left = AndExpr(left, right)
        return left

    def _parse_not(self) -> Expr:
        if self._peek().kind == "NOT":
            self._advance()
            return NotExpr(self._parse_not())
        return self._parse_atom_or_cmp()

    def _parse_atom_or_cmp(self) -> Expr:
        atom = self._parse_atom()
        if self._peek().kind in ("EQ", "NEQ"):
            if not isinstance(atom, IdentExpr):
                raise ExpressionError(
                    "Comparison left side must be a bare identifier (predicate id)"
                )
            op_tok = self._advance()
            right_tok = self._expect("IDENT")
            return CompareExpr(left=atom.name, op=op_tok.value, right=right_tok.value)
        return atom

    def _parse_atom(self) -> Expr:
        tok = self._peek()
        if tok.kind == "LPAREN":
            self._advance()
            inner = self._parse_or()
            self._expect("RPAREN")
            return inner
        if tok.kind == "IDENT":
            self._advance()
            return IdentExpr(name=tok.value)
        raise ExpressionError(f"Unexpected token at pos {tok.pos}: {tok.kind} ({tok.value!r})")


def parse(source: str) -> Expr:
    return _Parser(tokenize(source)).parse()


# Evaluator ---------------------------------------------------------------


def evaluate(expr: Expr, context: dict[str, bool | str | int | float]) -> bool:
    if isinstance(expr, IdentExpr):
        if expr.name not in context:
            raise ExpressionError(f"Predicate '{expr.name}' is not provided")
        value = context[expr.name]
        if not isinstance(value, bool):
            raise ExpressionError(
                f"Predicate '{expr.name}' has non-boolean value {value!r}; "
                "use comparison (==/!=) for enum predicates"
            )
        return value
    if isinstance(expr, CompareExpr):
        if expr.left not in context:
            raise ExpressionError(f"Predicate '{expr.left}' is not provided")
        actual = context[expr.left]
        equal = actual == expr.right
        return equal if expr.op == "==" else not equal
    if isinstance(expr, NotExpr):
        return not evaluate(expr.inner, context)
    if isinstance(expr, AndExpr):
        return evaluate(expr.left, context) and evaluate(expr.right, context)
    if isinstance(expr, OrExpr):
        return evaluate(expr.left, context) or evaluate(expr.right, context)
    raise ExpressionError(f"Unknown expression type: {type(expr).__name__}")


def referenced_idents(expr: Expr) -> Iterator[str]:
    """Yield all predicate identifiers referenced in the expression.

    Useful for static checks (e.g. verifying every referenced id has a
    matching `predikat` in the rule definition).
    """
    if isinstance(expr, IdentExpr):
        yield expr.name
    elif isinstance(expr, CompareExpr):
        yield expr.left
    elif isinstance(expr, NotExpr):
        yield from referenced_idents(expr.inner)
    elif isinstance(expr, (AndExpr, OrExpr)):
        yield from referenced_idents(expr.left)
        yield from referenced_idents(expr.right)
