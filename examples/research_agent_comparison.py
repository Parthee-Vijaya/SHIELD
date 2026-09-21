"""
Example demonstrating the migration from legacy AgentExecutor to modern LangGraph StateGraph
for the research agent implementation.
"""

import asyncio
import json
from typing import Dict, Any

# Legacy implementation
from src.agents.research_agent import run_research_agent as run_legacy

# Modern LangGraph implementation
from src.agents.research_agent_langgraph import (
    run_research_agent as run_modern,
    ResearchOrchestrator
)


async def compare_implementations():
    """
    Compare legacy and modern research agent implementations.
    Both should produce similar results but use different internal patterns.
    """

    query = "What are the key GDPR requirements for AI systems processing personal data?"
    focus_areas = ["GDPR", "AI Act", "Data Protection"]

    print("=" * 80)
    print("Research Agent Implementation Comparison")
    print("=" * 80)
    print(f"\nQuery: {query}")
    print(f"Focus Areas: {', '.join(focus_areas)}")
    print("\n" + "-" * 80)

    # Run legacy implementation
    print("\n1. LEGACY IMPLEMENTATION (AgentExecutor)")
    print("-" * 80)
    try:
        legacy_result = run_legacy(
            query=query,
            focus_areas=focus_areas,
            model_name="gpt-4o-mini"
        )
        print("\n✓ Legacy implementation completed successfully")
        print(f"\nResult keys: {list(legacy_result.keys())}")
        if "summary" in legacy_result:
            print(f"\nSummary: {legacy_result['summary'][:200]}...")
    except Exception as e:
        print(f"\n✗ Legacy implementation failed: {e}")
        legacy_result = {"error": str(e)}

    # Run modern implementation
    print("\n\n2. MODERN IMPLEMENTATION (LangGraph StateGraph)")
    print("-" * 80)
    try:
        modern_result = run_modern(
            query=query,
            focus_areas=focus_areas,
            model_name="gpt-4o-mini"
        )
        print("\n✓ Modern implementation completed successfully")
        print(f"\nResult keys: {list(modern_result.keys())}")
        if "summary" in modern_result:
            print(f"\nSummary: {modern_result['summary'][:200]}...")
    except Exception as e:
        print(f"\n✗ Modern implementation failed: {e}")
        modern_result = {"error": str(e)}

    # Advanced usage: Using ResearchOrchestrator directly
    print("\n\n3. ADVANCED USAGE: Direct ResearchOrchestrator")
    print("-" * 80)
    try:
        orchestrator = ResearchOrchestrator(model_name="gpt-4o-mini")
        advanced_result = orchestrator.run(
            query=query,
            focus_areas=focus_areas
        )
        print("\n✓ Direct orchestrator usage completed successfully")
        print(f"\nResult keys: {list(advanced_result.keys())}")

        # Access state information if available
        if "timestamp" in advanced_result:
            print(f"\nTimestamp: {advanced_result['timestamp']}")
        if "errors" in advanced_result and advanced_result["errors"]:
            print(f"\nErrors encountered: {advanced_result['errors']}")

    except Exception as e:
        print(f"\n✗ Direct orchestrator usage failed: {e}")
        advanced_result = {"error": str(e)}

    # Summary
    print("\n\n" + "=" * 80)
    print("COMPARISON SUMMARY")
    print("=" * 80)

    print("\nLegacy Implementation (AgentExecutor):")
    print("  • Pattern: create_react_agent + AgentExecutor")
    print("  • Control: Limited workflow control")
    print("  • State: Implicit state management")
    print("  • Status: Deprecated in LangChain v1.0")

    print("\nModern Implementation (LangGraph StateGraph):")
    print("  • Pattern: StateGraph with explicit nodes and edges")
    print("  • Control: Full workflow control with customizable nodes")
    print("  • State: Explicit TypedDict state management")
    print("  • Status: Recommended for LangChain v1.0+")

    print("\nKey Benefits of Migration:")
    print("  ✓ Better error handling and state tracking")
    print("  ✓ More controllable and debuggable workflows")
    print("  ✓ Easier to extend with additional nodes")
    print("  ✓ Compatible with LangChain v1.0 best practices")
    print("  ✓ Better integration with multi-agent systems")

    print("\n" + "=" * 80)

    return {
        "legacy": legacy_result,
        "modern": modern_result,
        "advanced": advanced_result
    }


async def simple_modern_usage():
    """
    Simple example of using the modern implementation.
    """
    print("\n" + "=" * 80)
    print("SIMPLE MODERN USAGE EXAMPLE")
    print("=" * 80)

    result = run_modern(
        query="What are the transparency requirements under EU AI Act?",
        focus_areas=["AI Act", "Transparency"],
        model_name="gpt-4o-mini"
    )

    print("\nQuery: What are the transparency requirements under EU AI Act?")
    print(f"\nFull Result:\n{json.dumps(result, indent=2, ensure_ascii=False)}")

    return result


def main():
    """
    Main entry point for the comparison script.
    """
    print("\n" + "=" * 80)
    print("RESEARCH AGENT MIGRATION DEMONSTRATION")
    print("=" * 80)
    print("\nThis script demonstrates the migration from legacy AgentExecutor")
    print("to modern LangGraph StateGraph pattern for the research agent.")
    print("\nNote: This is a live example and will make actual API calls.")
    print("=" * 80)

    # Uncomment to run the comparison
    # asyncio.run(compare_implementations())

    # Uncomment to run simple example
    # asyncio.run(simple_modern_usage())

    print("\n✓ Script loaded successfully")
    print("\nTo run examples, uncomment the desired function call in main()")
    print("\nAvailable functions:")
    print("  • compare_implementations() - Compare legacy vs modern")
    print("  • simple_modern_usage() - Simple modern implementation example")


if __name__ == "__main__":
    main()
