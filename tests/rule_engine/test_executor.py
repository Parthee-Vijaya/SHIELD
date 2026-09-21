"""Executor tests against the 3 pilot rules.

For each rule we verify:
  - trigger gating works (no signal -> not triggered)
  - 'så' branch hits (BETINGET-GO) for the canonical positive case
  - 'ellers' branch hits (GO) for the canonical negative case
  - missing predicate raises a helpful error
"""

from __future__ import annotations

from pathlib import Path

import pytest

from src.rule_engine.executor import RuleExecutor, RuleExecutionError, aggregate_status, evaluate_all
from src.rule_engine.loader import RuleLoader
from src.rule_engine.models import RuleInput, Status

RULES_DIR = Path(__file__).resolve().parents[2] / "rules"


@pytest.fixture(scope="module")
def rules():
    result = RuleLoader(RULES_DIR).load_all(raise_on_error=True)
    return {r.id: r for r in result.rules}


# AI Act art. 6 ----------------------------------------------------------


def test_ai_act_art6_not_triggered_without_signal(rules):
    rule = rules["ai_act.art6.hojrisiko_klassifikation"]
    decision = RuleExecutor(rule).evaluate(RuleInput(signals={}, predicates={}))
    assert decision.triggered is False
    assert decision.status is None


def test_ai_act_art6_betinget_go_for_biometri_with_profilering(rules):
    rule = rules["ai_act.art6.hojrisiko_klassifikation"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.uses_ai": True},
            predicates={
                "anvendelsesomraade": "biometri",
                "kun_forberedende": True,
                "profilering": True,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.BETINGET_GO
    assert decision.outcome is not None
    assert any("art. 9" in k for k in decision.outcome.krav)


def test_ai_act_art6_go_for_purely_preparatory_outside_annex_iii(rules):
    rule = rules["ai_act.art6.hojrisiko_klassifikation"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.uses_ai": True},
            predicates={
                "anvendelsesomraade": "intet_af_ovenstaaende",
                "kun_forberedende": True,
                "profilering": False,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.GO


# GDPR art. 22 -----------------------------------------------------------


def test_gdpr_art22_not_triggered_without_signal(rules):
    rule = rules["gdpr.art22.automatiseret_individuel_afgorelse"]
    decision = RuleExecutor(rule).evaluate(RuleInput(signals={}, predicates={}))
    assert decision.triggered is False


def test_gdpr_art22_betinget_go_for_fully_automated_with_legal_effect(rules):
    rule = rules["gdpr.art22.automatiseret_individuel_afgorelse"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.makes_decisions_about_persons": True},
            predicates={
                "er_helautomatiseret": True,
                "har_retsvirkning_eller_betydelig_paavirkning": True,
                "retsgrundlag_til_undtagelse": "samtykke",
                "omfatter_saerlige_kategorier": False,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.BETINGET_GO


def test_gdpr_art22_go_for_human_in_the_loop(rules):
    rule = rules["gdpr.art22.automatiseret_individuel_afgorelse"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.classifies_individuals": True},
            predicates={
                "er_helautomatiseret": False,
                "har_retsvirkning_eller_betydelig_paavirkning": True,
                "retsgrundlag_til_undtagelse": "intet",
                "omfatter_saerlige_kategorier": False,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.GO


# Forvaltningsloven §22 --------------------------------------------------


def test_forvaltningsloven_par22_not_triggered_without_signal(rules):
    rule = rules["forvaltningsloven.par22.begrundelsespligt"]
    decision = RuleExecutor(rule).evaluate(RuleInput(signals={}, predicates={}))
    assert decision.triggered is False


def test_forvaltningsloven_par22_betinget_go_for_written_partial_decision(rules):
    rule = rules["forvaltningsloven.par22.begrundelsespligt"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.makes_administrative_decisions": True},
            predicates={
                "traeffer_afgoerelse": True,
                "meddeles_skriftligt": True,
                "fuld_medhold": False,
                "kan_systemet_generere_begrundelse": "ja_delvist",
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.BETINGET_GO


def test_forvaltningsloven_par22_go_when_full_medhold(rules):
    rule = rules["forvaltningsloven.par22.begrundelsespligt"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.is_used_by_public_authority": True},
            predicates={
                "traeffer_afgoerelse": True,
                "meddeles_skriftligt": True,
                "fuld_medhold": True,
                "kan_systemet_generere_begrundelse": "ja_fuldt",
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.GO


# AI Act art. 5 (NO-GO) -------------------------------------------------


def test_ai_act_art5_no_go_for_social_scoring(rules):
    rule = rules["ai_act.art5.forbudte_praksisser"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.uses_ai": True},
            predicates={
                "anvendelse": "social_scoring_offentlig_myndighed",
                "medicinsk_eller_sikkerheds_undtagelse": False,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.NO_GO
    assert "forbudt" in (decision.outcome.begrundelse or "").lower()


def test_ai_act_art5_emotion_recognition_with_medical_exception_is_go(rules):
    rule = rules["ai_act.art5.forbudte_praksisser"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.uses_ai": True},
            predicates={
                "anvendelse": "foelelsesgenkendelse_paa_arbejdsplads_eller_uddannelse",
                "medicinsk_eller_sikkerheds_undtagelse": True,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.GO


def test_ai_act_art5_normal_use_is_go(rules):
    rule = rules["ai_act.art5.forbudte_praksisser"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.uses_ai": True},
            predicates={
                "anvendelse": "intet_af_ovenstaaende",
                "medicinsk_eller_sikkerheds_undtagelse": False,
            },
        )
    )
    assert decision.triggered is True
    assert decision.status == Status.GO


# Cross-cutting ----------------------------------------------------------


def test_missing_predicate_returns_needs_input(rules):
    rule = rules["gdpr.art22.automatiseret_individuel_afgorelse"]
    decision = RuleExecutor(rule).evaluate(
        RuleInput(
            signals={"system.makes_decisions_about_persons": True},
            predicates={"er_helautomatiseret": True},
        )
    )
    # Triggered but cannot decide because predicate answers are missing
    assert decision.triggered is True
    assert decision.status is None
    assert decision.outcome is None
    assert "har_retsvirkning_eller_betydelig_paavirkning" in decision.needs_input


def test_aggregate_status_picks_strictest():
    from src.rule_engine.models import LawSource, RuleDecision, RuleOutcome

    src = LawSource(
        lov="Test",
        artikel="Art 1",
        citat="placeholder citat tekst her",
        url="https://example.com",
        sidst_verificeret="2026-05-07",
    )
    decisions = [
        RuleDecision(
            rule_id="r.go",
            triggered=True,
            status=Status.GO,
            outcome=RuleOutcome(status=Status.GO),
            kilde=src,
        ),
        RuleDecision(
            rule_id="r.betinget",
            triggered=True,
            status=Status.BETINGET_GO,
            outcome=RuleOutcome(status=Status.BETINGET_GO),
            kilde=src,
        ),
    ]
    assert aggregate_status(decisions) == Status.BETINGET_GO

    decisions.append(
        RuleDecision(
            rule_id="r.no",
            triggered=True,
            status=Status.NO_GO,
            outcome=RuleOutcome(status=Status.NO_GO),
            kilde=src,
        )
    )
    assert aggregate_status(decisions) == Status.NO_GO


def test_aggregate_status_fails_closed_for_missing_or_no_decision():
    from src.rule_engine.models import LawSource, RuleDecision

    src = LawSource(
        lov="Test",
        artikel="Art 1",
        citat="placeholder citat tekst her",
        url="https://example.com",
        sidst_verificeret="2026-05-07",
    )
    unresolved = RuleDecision(
        rule_id="r.unresolved",
        triggered=True,
        status=None,
        outcome=None,
        kilde=src,
        needs_input=["retsgrundlag"],
    )
    assert aggregate_status([unresolved]) == Status.BETINGET_GO
    assert aggregate_status([]) == Status.BETINGET_GO


def test_evaluate_all_returns_one_decision_per_rule(rules):
    """Realistic full-pipeline run: a Borgerassistent that processes
    personal data and assists with administrative decisions. Most rules
    should trigger; a couple shouldn't."""
    rule_list = list(rules.values())
    decisions = evaluate_all(
        rule_list,
        RuleInput(
            signals={
                "system.uses_ai": True,
                "system.processes_personal_data": True,
                "system.makes_decisions_about_persons": True,
                "system.is_used_by_public_authority": True,
                "system.makes_administrative_decisions": True,
                "system.generates_decision_text": True,
                # not triggered:
                "system.interacts_with_persons": False,
                "system.generates_synthetic_content": False,
                "system.recognizes_emotions_or_biometrics": False,
                "system.aggregates_or_combines_databases": False,
            },
            predicates={
                # ai_act.art5
                "anvendelse": "intet_af_ovenstaaende",
                "medicinsk_eller_sikkerheds_undtagelse": False,
                # ai_act.art6
                "anvendelsesomraade": "vaesentlige_offentlige_tjenester",
                "kun_forberedende": False,
                "profilering": True,
                # gdpr.art6
                "retsgrundlag": "samfundets_interesse_eller_offentlig_myndighed_e",
                "behandler_saerlige_kategorier": False,
                "nationalt_retsgrundlag_dokumenteret": True,
                # gdpr.art22
                "er_helautomatiseret": True,
                "har_retsvirkning_eller_betydelig_paavirkning": True,
                "retsgrundlag_til_undtagelse": "lov",
                "omfatter_saerlige_kategorier": False,
                # gdpr.art35
                "art35_stk3_litra": "litra_a_systematisk_omfattende_evaluering_med_retsvirkning",
                "paa_datatilsynets_liste": True,
                "art35_stk1_hoj_risiko": True,
                "dpia_eksisterer": False,
                # forvaltningsloven.par19
                "traeffer_afgoerelse": True,
                "bruger_oplysninger_om_part": True,
                "parten_kender_oplysningerne": False,
                "ufordelagtig_for_parten": True,
                # forvaltningsloven.par22 (traeffer_afgoerelse shared)
                "meddeles_skriftligt": True,
                "fuld_medhold": False,
                "kan_systemet_generere_begrundelse": "ja_delvist",
                # forvaltningsloven.par24
                "genererer_begrundelse": True,
                "indeholder_lovhenvisning": True,
                "angiver_hovedhensyn_ved_skon": "ja",
                "angiver_faktiske_omstaendigheder": True,
                "lovhenvisninger_verificerbare": True,
                # offentlighedsloven.par13 (still triggered by is_used_by_public_authority)
                "laver_sammenstillinger": False,
                "enkle_kommandoer": False,
                "indeholder_personoplysninger": False,
                "anonymiseringskapacitet": True,
            },
        ),
    )
    assert len(decisions) == len(rule_list)
    triggered_ids = {d.rule_id for d in decisions if d.triggered}
    # rules that should fire on these signals
    assert "ai_act.art5.forbudte_praksisser" in triggered_ids
    assert "ai_act.art6.hojrisiko_klassifikation" in triggered_ids
    assert "gdpr.art22.automatiseret_individuel_afgorelse" in triggered_ids
    assert "gdpr.art35.dpia_pligt" in triggered_ids
    assert "forvaltningsloven.par22.begrundelsespligt" in triggered_ids
    # offentlighedsloven triggers (used by public authority) but resolves to GO
    # because the system doesn't actually do data aggregation
    # this configuration should yield BETINGET-GO overall (DPIA missing,
    # high-risk classification, etc.) — not NO-GO since art. 5 is "intet"
    assert aggregate_status(decisions) == Status.BETINGET_GO
