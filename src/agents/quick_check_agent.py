"""LangChain-baseret agent til hurtig compliance-vurdering."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, Optional

from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import tool
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel, Field

from src.core.models import ProjectInput
from src.compliance.ai_act_checker import AIActComplianceChecker
from src.compliance.gdpr_checker import GDPRComplianceChecker
from src.research.web_searcher import WebSearcher

logger = logging.getLogger(__name__)

_ai_act_checker = AIActComplianceChecker()
_gdpr_checker = GDPRComplianceChecker()


class QuickCheckToolInput(BaseModel):
    """Inputskema for hurtig compliance-vurdering."""

    description: str = Field(..., description="Kort beskrivelse af AI-systemet")
    ai_type: str = Field(..., description="AI-typen (fx generative_ai, nlp)")
    sector: str = Field(..., description="Fagområde/forretningsområde")
    behandler_persondata: bool = Field(False, description="Om systemet behandler persondata")
    automatiserede_beslutninger: bool = Field(False, description="Om systemet træffer automatiserede beslutninger")


@tool(args_schema=QuickCheckToolInput)
def quick_compliance_check(
    description: str,
    ai_type: str,
    sector: str,
    behandler_persondata: bool = False,
    automatiserede_beslutninger: bool = False,
) -> str:
    """Udfør hurtig vurdering af AI Act-risiko og GDPR-relevans.

    Args:
        description: Beskrivelse af AI-systemet
        ai_type: AI-typen (fx generative_ai, nlp)
        sector: Fagområde/forretningsområde
        behandler_persondata: Om systemet behandler persondata
        automatiserede_beslutninger: Om systemet træffer automatiserede beslutninger
    """

    project = ProjectInput(
        name="Hurtig Agent Vurdering",
        description=description,
        ai_type=ai_type,
        sector=sector,
        personal_data=behandler_persondata,
        automated_decision_making=automatiserede_beslutninger,
    )

    risk_level, reasons = _ai_act_checker.assess_risk_level(project)
    gdpr_relevant = behandler_persondata
    gdpr_high_risk = _gdpr_checker._requires_dpia(project) if gdpr_relevant else False

    result = {
        "ai_act": {
            "risk_level": risk_level.value,
            "reasons": reasons,
        },
        "gdpr": {
            "relevant": gdpr_relevant,
            "requires_dpia": gdpr_high_risk,
        },
        "needs_full_assessment": risk_level in {"high", "unacceptable"} or gdpr_high_risk,
        "recommendations": _generate_recommendations(risk_level.value, gdpr_relevant, gdpr_high_risk),
    }
    return json.dumps(result, ensure_ascii=False)


async def _search_precedents(
    description: str,
    ai_type: str,
    sector: str,
    progress_callback: Optional[callable] = None
) -> Dict[str, Any]:
    """Søg efter relevante præcedens og afgørelser på nettet."""
    try:
        if progress_callback:
            await progress_callback("🔍 Initialiserer web søgning...", "loading")
            await progress_callback("→ Opretter WebSearcher klient...", "loading")

        async with WebSearcher() as searcher:
            # Byg søgequery med AI Act og GDPR fokus
            query = f"AI Act GDPR {ai_type} {sector} afgørelser præcedens compliance"

            if progress_callback:
                await progress_callback(f"→ Søgequery: '{query[:60]}...'", "loading")
                await progress_callback("→ Starter parallelle søgninger...", "loading")

            # Søg med fokus på autoritative kilder
            search_results = await searcher.search(
                query=query,
                max_results=5,
                focus_domains=['eur-lex.europa.eu', 'datatilsynet.dk', 'edpb.europa.eu', 'retsinformation.dk'],
                progress_callback=progress_callback
            )

            if not search_results:
                if progress_callback:
                    await progress_callback("⚠ Ingen præcedens fundet i databaser", "error")
                return {"precedents": [], "summary": "Ingen relevante præcedens fundet"}

            if progress_callback:
                await progress_callback(f"✓ Web søgning komplet - {len(search_results)} kilder fundet", "loading")
                await progress_callback("📝 Genererer LLM sammenfatning af kilder...", "loading")
                await progress_callback(f"→ Analyserer top {min(len(search_results), 3)} kilder...", "loading")

            # Brug LLM til at opsummere findings
            summary = await searcher.summarize_with_citations(
                query=f"Hvad siger præcedens og afgørelser om {description}?",
                sources=search_results[:3],
                max_length=200
            )

            if progress_callback:
                await progress_callback(f"✓ Sammenfatning genereret ({len(summary)} tegn)", "loading")

            precedents = [
                {
                    "title": source.title,
                    "url": source.url,
                    "authority": source.authority,
                    "relevance": source.relevance_score
                }
                for source in search_results[:3]
            ]

            return {
                "precedents": precedents,
                "summary": summary
            }
    except Exception as e:
        logger.warning(f"Web search failed: {e}")
        if progress_callback:
            await progress_callback(f"Søgning fejlede: {str(e)[:50]}", "error")
        return {"precedents": [], "summary": "Søgning ikke tilgængelig"}


def _generate_recommendations(risk_level: str, gdpr_relevant: bool, gdpr_high_risk: bool) -> list[str]:
    recs: list[str] = []
    if risk_level in {"unacceptable", "high"}:
        recs.append("Planlæg en fuld compliance control for højrisikosystemet.")
        recs.append("Udarbejd teknisk dokumentation og kvalitetsstyring før idriftsættelse.")
    if gdpr_relevant:
        recs.append("Sørg for lovligt behandlingsgrundlag og informationspligt.")
    if gdpr_high_risk:
        recs.append("Gennemfør en DPIA i samarbejde med databeskyttelsesrådgiver.")
    if not recs:
        recs.append("Fortsæt monitorering og dokumentér governance-tiltag.")
    return recs


def _default_chat_model(model_name: Optional[str] = None):
    model_name = model_name or os.getenv("DEFAULT_LLM_MODEL", "gpt-4o-mini")
    temperature = float(os.getenv("QUICKCHECK_AGENT_TEMPERATURE", "0.1"))

    if "claude" in model_name.lower():
        return ChatAnthropic(
            model=model_name,
            temperature=temperature,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )

    return ChatOpenAI(
        model=model_name,
        temperature=temperature,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def create_quick_check_agent(model_name: Optional[str] = None) -> AgentExecutor:
    """Opret LangChain-agent til hurtig compliance screening."""

    llm = _default_chat_model(model_name)
    tools = [quick_compliance_check]

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Du er en AI-compliance assistent. Brug `quick_compliance_check` til at hente vurdering. "
                'Svar KUN med JSON: {"risk_summary": "...", "ai_act": {...}, "gdpr": {...}, "recommendations": ["..."]}.'
            ),
            ("user", "{input}"),
        ]
    )

    agent = create_react_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=os.getenv("QUICKCHECK_AGENT_DEBUG") == "1")


async def run_quick_check_agent(
    description: str,
    ai_type: str,
    sector: str,
    behandler_persondata: bool = False,
    automatiserede_beslutninger: bool = False,
    model_name: Optional[str] = None,
    progress_callback: Optional[callable] = None,
    enable_web_search: bool = True,
    intermediate_callback: Optional[callable] = None,
) -> Dict[str, Any]:
    """Kør agenten og returner JSON-output med web research.

    Args:
        intermediate_callback: Callback der kaldes med delresultater efter hver fase
    """
    import time
    start_time = time.time()

    # 1. Udfør grundlæggende compliance check
    if progress_callback:
        await progress_callback("🚀 Starter compliance analyse...", "loading")
        await progress_callback("📋 Opretter projekt data struktur...", "loading")

    project = ProjectInput(
        name="Hurtig Agent Vurdering",
        description=description,
        ai_type=ai_type,
        sector=sector,
        personal_data=behandler_persondata,
        automated_decision_making=automatiserede_beslutninger,
    )

    if progress_callback:
        await progress_callback(f"✓ Projekt oprettet: {ai_type} i {sector}", "loading")
        await progress_callback("🔍 Analyserer AI Act forordning...", "loading")
        await progress_callback("→ Tjekker forbudte praksisser (Art. 5)...", "loading")

    step_start = time.time()
    risk_level, reasons = _ai_act_checker.assess_risk_level(project)
    step_duration = time.time() - step_start

    if progress_callback:
        await progress_callback(f"✓ AI Act vurdering færdig ({step_duration:.2f}s)", "loading")
        await progress_callback(f"📊 Risikoniveau identificeret: {risk_level.value.upper()}", "loading")
        await progress_callback(f"→ Fundet {len(reasons)} risikofaktorer", "loading")

    gdpr_relevant = behandler_persondata

    if progress_callback:
        await progress_callback("🔒 Analyserer GDPR krav...", "loading")
        if behandler_persondata:
            await progress_callback("→ System behandler persondata - fuld GDPR analyse...", "loading")
        else:
            await progress_callback("→ Ingen persondata - GDPR ikke relevant", "loading")

    step_start = time.time()
    gdpr_high_risk = _gdpr_checker._requires_dpia(project) if gdpr_relevant else False
    step_duration = time.time() - step_start

    if progress_callback:
        await progress_callback(f"✓ GDPR analyse færdig ({step_duration:.2f}s)", "loading")
        if gdpr_relevant:
            await progress_callback(f"→ DPIA påkrævet: {'JA' if gdpr_high_risk else 'NEJ'}", "loading")
        if automatiserede_beslutninger:
            await progress_callback("⚠ Automatiserede beslutninger - Artikel 22 gælder", "loading")

    # Send intermediate result efter fase 1 (compliance analyse)
    phase1_result = {
        "phase": 1,
        "phase_name": "Compliance Analyse",
        "ai_act": {
            "risk_level": risk_level.value,
            "reasons": reasons,
        },
        "gdpr": {
            "relevant": gdpr_relevant,
            "requires_dpia": gdpr_high_risk,
        },
        "needs_full_assessment": risk_level in {"high", "unacceptable"} or gdpr_high_risk,
        "recommendations": _generate_recommendations(risk_level.value, gdpr_relevant, gdpr_high_risk),
    }

    if intermediate_callback:
        await intermediate_callback(phase1_result)

    # 2. Søg efter præcedens og afgørelser (async) - kun hvis enabled
    if enable_web_search:
        if progress_callback:
            await progress_callback("🌐 Starter web research fase...", "loading")
            await progress_callback("→ Forbereder søgning i juridiske databaser...", "loading")

        search_start = time.time()
        try:
            precedents_data = await _search_precedents(description, ai_type, sector, progress_callback)
            search_duration = time.time() - search_start

            if progress_callback:
                await progress_callback(f"✓ Web research færdig ({search_duration:.2f}s)", "success")
                await progress_callback(f"📚 Fundet {len(precedents_data.get('precedents', []))} relevante kilder", "loading")

            # Send intermediate result efter fase 2 (web research)
            phase2_result = {
                "phase": 2,
                "phase_name": "Web Research",
                "precedents": precedents_data.get("precedents", []),
                "precedents_summary": precedents_data.get("summary", ""),
            }

            if intermediate_callback:
                await intermediate_callback(phase2_result)

        except Exception as e:
            search_duration = time.time() - search_start
            logger.warning(f"Precedent search failed: {e}")
            if progress_callback:
                await progress_callback(f"❌ Præcedens søgning fejlede efter {search_duration:.2f}s", "error")
                await progress_callback(f"Fejl: {str(e)[:100]}", "error")
            precedents_data = {"precedents": [], "summary": "Søgning ikke tilgængelig"}
    else:
        if progress_callback:
            await progress_callback("⏩ Web søgning sprunget over (deaktiveret)", "success")
        precedents_data = {"precedents": [], "summary": "Web søgning ikke aktiveret"}

    # 3. Generer kortfattet svar med LLM
    if progress_callback:
        await progress_callback("🤖 Genererer AI-drevet sammenfatning...", "loading")
        await progress_callback("→ Initialiserer LLM model...", "loading")

    llm_start = time.time()
    llm = _default_chat_model(model_name)

    if progress_callback:
        await progress_callback(f"→ LLM model klar: {model_name or 'gpt-4o-mini'}", "loading")
        await progress_callback("→ Bygger prompt med compliance data...", "loading")

    summary_prompt = f"""Baseret på følgende compliance analyse, giv et KORT og PRÆCIST svar (max 3-4 linjer):

AI System: {description}
AI Act Risiko: {risk_level.value}
GDPR Relevant: {gdpr_relevant}
Præcedens: {precedents_data.get('summary', 'Ingen fundet')}

Giv et kortfattet svar der:
1. Angiver risikoniveau
2. Fremhæver vigtigste compliance krav
3. Nævner relevante præcedens hvis fundet

Svar kun med tekst, ingen overskrifter eller formatering."""

    if progress_callback:
        await progress_callback("→ Sender request til LLM...", "loading")

    try:
        llm_response = llm.invoke(summary_prompt)
        llm_duration = time.time() - llm_start
        short_summary = llm_response.content if hasattr(llm_response, 'content') else str(llm_response)

        if progress_callback:
            await progress_callback(f"✓ LLM sammenfatning genereret ({llm_duration:.2f}s)", "success")
            await progress_callback(f"→ Sammenfatning længde: {len(short_summary)} tegn", "loading")

        # Send intermediate result efter fase 3 (LLM summary)
        phase3_result = {
            "phase": 3,
            "phase_name": "AI Sammenfatning",
            "short_summary": short_summary.strip(),
        }

        if intermediate_callback:
            await intermediate_callback(phase3_result)

    except Exception as e:
        llm_duration = time.time() - llm_start
        logger.warning(f"LLM summary failed: {e}")
        short_summary = f"Systemet vurderes som {risk_level.value} risiko under AI Act."

        if progress_callback:
            await progress_callback(f"⚠ LLM fejlede efter {llm_duration:.2f}s - bruger fallback", "loading")
            await progress_callback(f"Fejl: {str(e)[:80]}", "error")

    # 4. Byg komplet response
    if progress_callback:
        await progress_callback("📦 Bygger final rapport...", "loading")
        await progress_callback("→ Sammensætter alle analyseresultater...", "loading")

    result = {
        "ai_act": {
            "risk_level": risk_level.value,
            "reasons": reasons,
        },
        "gdpr": {
            "relevant": gdpr_relevant,
            "requires_dpia": gdpr_high_risk,
        },
        "needs_full_assessment": risk_level in {"high", "unacceptable"} or gdpr_high_risk,
        "recommendations": _generate_recommendations(risk_level.value, gdpr_relevant, gdpr_high_risk),
        "precedents": precedents_data.get("precedents", []),
        "precedents_summary": precedents_data.get("summary", ""),
        "short_summary": short_summary.strip()
    }

    total_duration = time.time() - start_time

    if progress_callback:
        await progress_callback(f"✓ Rapport komplet med {len(result['recommendations'])} anbefalinger", "loading")
        await progress_callback(f"🎉 Analyse fuldført! Total tid: {total_duration:.2f}s", "success")

    return result


__all__ = ["create_quick_check_agent", "run_quick_check_agent"]
