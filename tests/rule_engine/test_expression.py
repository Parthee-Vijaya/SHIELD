"""Tests for the boolean expression parser/evaluator.

Cover the operators (AND, OR, NOT), comparison (==, !=), parentheses,
precedence, error cases, and the static `referenced_idents` helper.
"""

from __future__ import annotations

import pytest

from src.rule_engine.expression import (
    AndExpr,
    CompareExpr,
    ExpressionError,
    IdentExpr,
    NotExpr,
    OrExpr,
    evaluate,
    parse,
    referenced_idents,
    tokenize,
)


class TestTokenize:
    def test_simple_ident(self):
        toks = tokenize("foo")
        assert [t.kind for t in toks] == ["IDENT", "EOF"]

    def test_keywords_become_own_kinds(self):
        toks = tokenize("a AND b OR NOT c")
        kinds = [t.kind for t in toks if t.kind != "EOF"]
        assert kinds == ["IDENT", "AND", "IDENT", "OR", "NOT", "IDENT"]

    def test_comparison_tokens(self):
        toks = tokenize("foo == bar")
        kinds = [t.kind for t in toks if t.kind != "EOF"]
        assert kinds == ["IDENT", "EQ", "IDENT"]

    def test_neq(self):
        toks = tokenize("foo != bar")
        kinds = [t.kind for t in toks if t.kind != "EOF"]
        assert kinds == ["IDENT", "NEQ", "IDENT"]

    def test_invalid_char_raises(self):
        with pytest.raises(ExpressionError):
            tokenize("foo & bar")


class TestParse:
    def test_single_ident(self):
        assert parse("foo") == IdentExpr("foo")

    def test_and(self):
        assert parse("a AND b") == AndExpr(IdentExpr("a"), IdentExpr("b"))

    def test_or(self):
        assert parse("a OR b") == OrExpr(IdentExpr("a"), IdentExpr("b"))

    def test_not(self):
        assert parse("NOT a") == NotExpr(IdentExpr("a"))

    def test_and_binds_tighter_than_or(self):
        ast = parse("a OR b AND c")
        assert ast == OrExpr(IdentExpr("a"), AndExpr(IdentExpr("b"), IdentExpr("c")))

    def test_parentheses_override_precedence(self):
        ast = parse("(a OR b) AND c")
        assert ast == AndExpr(OrExpr(IdentExpr("a"), IdentExpr("b")), IdentExpr("c"))

    def test_double_not(self):
        assert parse("NOT NOT a") == NotExpr(NotExpr(IdentExpr("a")))

    def test_compare_eq(self):
        assert parse("color == red") == CompareExpr("color", "==", "red")

    def test_compare_neq(self):
        assert parse("color != blue") == CompareExpr("color", "!=", "blue")

    def test_compare_in_complex(self):
        ast = parse("a AND color != none")
        assert ast == AndExpr(IdentExpr("a"), CompareExpr("color", "!=", "none"))

    def test_compare_lhs_must_be_ident(self):
        with pytest.raises(ExpressionError):
            parse("(a OR b) == c")

    def test_unbalanced_paren_raises(self):
        with pytest.raises(ExpressionError):
            parse("(a AND b")

    def test_empty_string_raises(self):
        with pytest.raises(ExpressionError):
            parse("")

    def test_trailing_garbage_raises(self):
        with pytest.raises(ExpressionError):
            parse("a AND b extra_ident")


class TestEvaluate:
    def test_ident_true(self):
        assert evaluate(parse("a"), {"a": True}) is True

    def test_ident_false(self):
        assert evaluate(parse("a"), {"a": False}) is False

    def test_and(self):
        assert evaluate(parse("a AND b"), {"a": True, "b": True}) is True
        assert evaluate(parse("a AND b"), {"a": True, "b": False}) is False

    def test_or(self):
        assert evaluate(parse("a OR b"), {"a": False, "b": True}) is True
        assert evaluate(parse("a OR b"), {"a": False, "b": False}) is False

    def test_not(self):
        assert evaluate(parse("NOT a"), {"a": False}) is True
        assert evaluate(parse("NOT a"), {"a": True}) is False

    def test_compare_eq(self):
        assert evaluate(parse("color == red"), {"color": "red"}) is True
        assert evaluate(parse("color == red"), {"color": "blue"}) is False

    def test_compare_neq(self):
        assert evaluate(parse("color != red"), {"color": "blue"}) is True
        assert evaluate(parse("color != red"), {"color": "red"}) is False

    def test_complex_with_compare_and_parens(self):
        expr = parse("anvendelse != intet AND (NOT kun_forberedende OR profilering)")
        ctx_a = {"anvendelse": "biometri", "kun_forberedende": False, "profilering": False}
        ctx_b = {"anvendelse": "biometri", "kun_forberedende": True, "profilering": True}
        ctx_c = {"anvendelse": "intet", "kun_forberedende": False, "profilering": True}
        ctx_d = {"anvendelse": "biometri", "kun_forberedende": True, "profilering": False}
        assert evaluate(expr, ctx_a) is True   # not forberedende -> true
        assert evaluate(expr, ctx_b) is True   # profilering -> true
        assert evaluate(expr, ctx_c) is False  # anvendelse == intet -> false
        assert evaluate(expr, ctx_d) is False  # forberedende AND not profilering -> false

    def test_missing_predicate_raises(self):
        with pytest.raises(ExpressionError):
            evaluate(parse("a AND b"), {"a": True})

    def test_non_bool_predicate_used_as_atom_raises(self):
        with pytest.raises(ExpressionError):
            evaluate(parse("color"), {"color": "red"})


class TestReferencedIdents:
    def test_collects_idents_from_compound(self):
        expr = parse("a AND (b OR NOT c) AND d == foo")
        assert sorted(referenced_idents(expr)) == ["a", "b", "c", "d"]
