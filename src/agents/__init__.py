"""Samling af agent-relaterede utilities."""

from .registry import AgentConfig, AgentRegistry, get_agent_registry
from .quick_check_agent import create_quick_check_agent, run_quick_check_agent

# Modern LangGraph implementations
from .research_agent_langgraph import (
    ResearchOrchestrator,
    create_research_orchestrator,
    run_research_agent
)

__all__ = [
    "AgentConfig",
    "AgentRegistry",
    "get_agent_registry",
    "create_quick_check_agent",
    "run_quick_check_agent",
    # Modern LangGraph implementations
    "ResearchOrchestrator",
    "create_research_orchestrator",
    "run_research_agent",
]
