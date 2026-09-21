"""
LangGraph-based Research Agent for Legal Research
Modern implementation using StateGraph pattern instead of legacy AgentExecutor
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, TypedDict, Annotated, Sequence
from datetime import datetime
from enum import Enum
import operator

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain.tools import tool
from pydantic import BaseModel, Field

from src.research.web_searcher import WebSearcher

import logging

logger = logging.getLogger(__name__)


class ResearchToolInput(BaseModel):
    """Input schema for web_research tool."""

    query: str = Field(..., description="Research question to investigate")
    focus_areas: Optional[List[str]] = Field(
        default=None,
        description="List of topics to prioritize (e.g., 'GDPR', 'High-risk AI')",
    )


@tool(args_schema=ResearchToolInput)
async def web_research(query: str, focus_areas: Optional[List[str]] = None) -> str:
    """Perform legal research in authoritative sources and return structured JSON.

    Args:
        query: Research question to investigate
        focus_areas: List of topics to prioritize (e.g., 'GDPR', 'High-risk AI')
    """
    async with WebSearcher() as searcher:
        result = await searcher.research_topic(query=query, focus_areas=focus_areas)
    return json.dumps(result, ensure_ascii=False)


class ResearchState(TypedDict):
    """State definition for research workflow"""
    messages: Annotated[Sequence[BaseMessage], operator.add]
    query: str
    focus_areas: Optional[List[str]]
    raw_research_data: Dict[str, Any]
    synthesized_findings: Dict[str, Any]
    final_output: Dict[str, Any]
    current_step: str
    errors: List[str]


class ResearchStep(str, Enum):
    """Workflow steps in research process"""
    INITIALIZATION = "initialization"
    RESEARCH = "research"
    SYNTHESIS = "synthesis"
    FINALIZATION = "finalization"
    COMPLETE = "complete"


class ResearchOrchestrator:
    """
    Modern research agent orchestrator using LangGraph StateGraph
    Replaces legacy AgentExecutor pattern with controllable workflow
    """

    def __init__(self, model_name: Optional[str] = None):
        """
        Initialize research orchestrator with LLM model.

        Args:
            model_name: LLM model to use (defaults to env DEFAULT_LLM_MODEL)
        """
        self.model_name = model_name or os.getenv("DEFAULT_LLM_MODEL", "gpt-4o-mini")
        self.temperature = float(os.getenv("RESEARCH_AGENT_TEMPERATURE", "0.2"))
        self.verbose = os.getenv("RESEARCH_AGENT_DEBUG") == "1"

        # Initialize LLM
        if "claude" in self.model_name.lower():
            self.llm = ChatAnthropic(
                model=self.model_name,
                temperature=self.temperature,
                api_key=os.getenv("ANTHROPIC_API_KEY"),
            )
        else:
            self.llm = ChatOpenAI(
                model=self.model_name,
                temperature=self.temperature,
                api_key=os.getenv("OPENAI_API_KEY"),
            )

        # Build the workflow
        self.workflow = self._build_workflow()

    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow for research process"""
        workflow = StateGraph(ResearchState)

        # Define nodes
        workflow.add_node("initialize", self._initialize_node)
        workflow.add_node("research", self._research_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.add_node("finalize", self._finalize_node)

        # Define edges (linear workflow)
        workflow.set_entry_point("initialize")
        workflow.add_edge("initialize", "research")
        workflow.add_edge("research", "synthesize")
        workflow.add_edge("synthesize", "finalize")
        workflow.add_edge("finalize", END)

        return workflow.compile()

    def _initialize_node(self, state: ResearchState) -> ResearchState:
        """
        Initialize the research process.

        Args:
            state: Current research state

        Returns:
            Updated state with initialization complete
        """
        logger.info(f"Initializing research for query: {state['query']}")

        focus_text = ""
        if state.get("focus_areas"):
            focus_text = f" (Focus: {', '.join(state['focus_areas'])})"

        state["messages"].append(
            SystemMessage(content=f"Starting legal research: {state['query']}{focus_text}")
        )
        state["current_step"] = ResearchStep.INITIALIZATION

        if self.verbose:
            logger.debug(f"Initialized state: {state}")

        return state

    def _research_node(self, state: ResearchState) -> ResearchState:
        """
        Perform web research using the web_research tool.

        Args:
            state: Current research state

        Returns:
            Updated state with raw research data
        """
        logger.info("Performing web research")
        state["current_step"] = ResearchStep.RESEARCH

        try:
            # Execute web research tool
            import asyncio
            research_result_str = asyncio.run(
                web_research(
                    query=state["query"],
                    focus_areas=state.get("focus_areas")
                )
            )

            # Parse JSON result
            research_data = json.loads(research_result_str)
            state["raw_research_data"] = research_data

            state["messages"].append(
                AIMessage(content=f"Research complete: Found {len(research_data.get('sources', []))} sources")
            )

            if self.verbose:
                logger.debug(f"Research data: {research_data}")

        except Exception as e:
            logger.error(f"Research failed: {e}")
            state["errors"].append(f"Research error: {str(e)}")
            state["raw_research_data"] = {"error": str(e)}

        return state

    def _synthesize_node(self, state: ResearchState) -> ResearchState:
        """
        Synthesize research findings using LLM.

        Args:
            state: Current research state

        Returns:
            Updated state with synthesized findings
        """
        logger.info("Synthesizing research findings")
        state["current_step"] = ResearchStep.SYNTHESIS

        try:
            # Check for research errors
            if "error" in state["raw_research_data"]:
                state["synthesized_findings"] = {
                    "error": "Cannot synthesize due to research error",
                    "original_error": state["raw_research_data"]["error"]
                }
                return state

            # Create synthesis prompt
            synthesis_prompt = self._create_synthesis_prompt(state)

            # Invoke LLM for synthesis
            response = self.llm.invoke([
                SystemMessage(
                    content="Du er en juridisk forsker med fokus på AI-compliance. "
                    "Analyser research-resultaterne og svar KUN med valid JSON."
                ),
                HumanMessage(content=synthesis_prompt)
            ])

            # Parse LLM response as JSON
            try:
                synthesized = json.loads(response.content)
                state["synthesized_findings"] = synthesized
            except json.JSONDecodeError:
                # Fallback: wrap raw content
                state["synthesized_findings"] = {
                    "summary": response.content,
                    "note": "LLM response was not valid JSON"
                }

            state["messages"].append(
                AIMessage(content="Synthesis complete")
            )

            if self.verbose:
                logger.debug(f"Synthesized findings: {state['synthesized_findings']}")

        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            state["errors"].append(f"Synthesis error: {str(e)}")
            state["synthesized_findings"] = {"error": str(e)}

        return state

    def _finalize_node(self, state: ResearchState) -> ResearchState:
        """
        Finalize research output.

        Args:
            state: Current research state

        Returns:
            Updated state with final output
        """
        logger.info("Finalizing research output")
        state["current_step"] = ResearchStep.FINALIZATION

        try:
            # Merge raw data and synthesized findings
            final_output = {
                "summary": state["synthesized_findings"].get("summary", ""),
                "key_findings": state["synthesized_findings"].get("key_findings", []),
                "recommended_actions": state["synthesized_findings"].get("recommended_actions", []),
                "sources": state["raw_research_data"].get("sources", []),
                "cross_references": state["synthesized_findings"].get("cross_references", []),
                "query": state["query"],
                "focus_areas": state.get("focus_areas", []),
                "timestamp": datetime.now().isoformat(),
                "errors": state.get("errors", [])
            }

            # Remove empty fields
            final_output = {k: v for k, v in final_output.items() if v}

            state["final_output"] = final_output
            state["current_step"] = ResearchStep.COMPLETE

            state["messages"].append(
                AIMessage(content="Research finalized")
            )

            if self.verbose:
                logger.debug(f"Final output: {final_output}")

        except Exception as e:
            logger.error(f"Finalization failed: {e}")
            state["errors"].append(f"Finalization error: {str(e)}")
            state["final_output"] = {
                "error": str(e),
                "query": state["query"]
            }

        return state

    def _create_synthesis_prompt(self, state: ResearchState) -> str:
        """
        Create synthesis prompt for LLM.

        Args:
            state: Current research state

        Returns:
            Formatted prompt string
        """
        raw_data = state["raw_research_data"]
        query = state["query"]

        prompt = f"""
Analyser følgende research-resultater og lav en struktureret syntese.

**Research-spørgsmål:** {query}

**Rå research-data:**
{json.dumps(raw_data, ensure_ascii=False, indent=2)}

**Opgave:**
Generer et JSON-objekt med følgende struktur:
{{
    "summary": "Kort dansk sammenfatning af de vigtigste fund",
    "key_findings": ["Punkt 1", "Punkt 2", ...],
    "recommended_actions": ["Handling 1", "Handling 2", ...],
    "cross_references": [
        {{
            "statement": "Påstand eller fund",
            "citations": [
                {{"title": "Kildetitel", "url": "URL"}}
            ]
        }}
    ]
}}

Svar KUN med valid JSON. Udelad felter der ikke er relevante.
"""
        return prompt.strip()

    def run(
        self,
        query: str,
        focus_areas: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Execute the research workflow.

        Args:
            query: Research question
            focus_areas: Optional list of focus topics

        Returns:
            Final research output as dictionary
        """
        # Initialize state
        initial_state: ResearchState = {
            "messages": [],
            "query": query,
            "focus_areas": focus_areas,
            "raw_research_data": {},
            "synthesized_findings": {},
            "final_output": {},
            "current_step": "",
            "errors": []
        }

        # Run workflow
        logger.info(f"Starting research workflow for query: {query}")
        final_state = self.workflow.invoke(initial_state)

        return final_state["final_output"]


# External API functions (maintain backward compatibility)

def create_research_orchestrator(model_name: Optional[str] = None) -> ResearchOrchestrator:
    """
    Create a research orchestrator instance.

    Args:
        model_name: LLM model to use

    Returns:
        ResearchOrchestrator instance
    """
    return ResearchOrchestrator(model_name=model_name)


def run_research_agent(
    query: str,
    focus_areas: Optional[List[str]] = None,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute research agent and return results.

    This function maintains API compatibility with the legacy implementation
    while using the modern LangGraph StateGraph pattern internally.

    Args:
        query: Research question
        focus_areas: Optional list of focus topics
        model_name: Optional LLM model name

    Returns:
        Research results as dictionary

    Example:
        >>> result = run_research_agent(
        ...     query="What are the GDPR requirements for AI systems?",
        ...     focus_areas=["GDPR", "AI Act"]
        ... )
        >>> print(result["summary"])
    """
    orchestrator = create_research_orchestrator(model_name)
    return orchestrator.run(query=query, focus_areas=focus_areas)


__all__ = [
    "ResearchOrchestrator",
    "ResearchState",
    "ResearchStep",
    "web_research",
    "create_research_orchestrator",
    "run_research_agent"
]
