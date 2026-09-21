# Research Agent Migration Guide

## Overview

This document describes the migration of the Research Agent from the legacy **AgentExecutor** pattern to the modern **LangGraph StateGraph** pattern, aligning with LangChain v1.0 best practices.

## Migration Summary

### What Changed

| Aspect | Legacy Implementation | Modern Implementation |
|--------|----------------------|----------------------|
| **File** | `src/agents/research_agent.py` | `src/agents/research_agent_langgraph.py` |
| **Pattern** | `create_react_agent()` + `AgentExecutor` | LangGraph `StateGraph` |
| **State Management** | Implicit (via AgentExecutor) | Explicit `ResearchState` TypedDict |
| **Workflow Control** | Fixed ReAct loop | Customizable node-based workflow |
| **Error Handling** | Basic try-catch | State-tracked errors per node |
| **Extensibility** | Limited | Easy to add nodes and customize flow |

### Why Migrate?

1. **LangChain v1.0 Compatibility**: AgentExecutor is deprecated in favor of LangGraph
2. **Better Control**: Explicit workflow with customizable nodes and edges
3. **Improved Debugging**: Clear state transitions and error tracking
4. **Enhanced Extensibility**: Easy to add new nodes or modify workflow
5. **Multi-agent Integration**: Better compatibility with orchestrator patterns

---

## Architecture Comparison

### Legacy Pattern (AgentExecutor)

```python
# Old implementation
def create_research_agent(model_name: Optional[str] = None) -> AgentExecutor:
    llm = _default_chat_model(model_name)
    tools = [web_research]

    prompt = ChatPromptTemplate.from_messages([...])
    agent = create_react_agent(llm, tools, prompt)

    return AgentExecutor(agent=agent, tools=tools, verbose=True)
```

**Workflow**: Implicit ReAct loop (Reason → Act → Observe → Repeat)

### Modern Pattern (LangGraph StateGraph)

```python
# New implementation
class ResearchOrchestrator:
    def _build_workflow(self) -> StateGraph:
        workflow = StateGraph(ResearchState)

        # Define explicit nodes
        workflow.add_node("initialize", self._initialize_node)
        workflow.add_node("research", self._research_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.add_node("finalize", self._finalize_node)

        # Define explicit edges
        workflow.set_entry_point("initialize")
        workflow.add_edge("initialize", "research")
        workflow.add_edge("research", "synthesize")
        workflow.add_edge("synthesize", "finalize")
        workflow.add_edge("finalize", END)

        return workflow.compile()
```

**Workflow**: Explicit node-based flow (Initialize → Research → Synthesize → Finalize)

---

## State Management

### ResearchState TypedDict

```python
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
```

**Benefits**:
- Type-safe state definition
- Clear data flow between nodes
- Easy to track errors and progress
- Annotated fields for special handling (e.g., message accumulation)

---

## Workflow Nodes

### 1. Initialize Node

**Purpose**: Set up the research session

```python
def _initialize_node(self, state: ResearchState) -> ResearchState:
    logger.info(f"Initializing research for query: {state['query']}")

    state["messages"].append(
        SystemMessage(content=f"Starting legal research: {state['query']}")
    )
    state["current_step"] = ResearchStep.INITIALIZATION

    return state
```

### 2. Research Node

**Purpose**: Execute web research using the `web_research` tool

```python
def _research_node(self, state: ResearchState) -> ResearchState:
    logger.info("Performing web research")
    state["current_step"] = ResearchStep.RESEARCH

    try:
        research_result_str = asyncio.run(
            web_research(query=state["query"], focus_areas=state.get("focus_areas"))
        )
        research_data = json.loads(research_result_str)
        state["raw_research_data"] = research_data
    except Exception as e:
        state["errors"].append(f"Research error: {str(e)}")
        state["raw_research_data"] = {"error": str(e)}

    return state
```

### 3. Synthesize Node

**Purpose**: Use LLM to synthesize research findings

```python
def _synthesize_node(self, state: ResearchState) -> ResearchState:
    logger.info("Synthesizing research findings")
    state["current_step"] = ResearchStep.SYNTHESIS

    try:
        synthesis_prompt = self._create_synthesis_prompt(state)
        response = self.llm.invoke([
            SystemMessage(content="Du er en juridisk forsker..."),
            HumanMessage(content=synthesis_prompt)
        ])

        synthesized = json.loads(response.content)
        state["synthesized_findings"] = synthesized
    except Exception as e:
        state["errors"].append(f"Synthesis error: {str(e)}")

    return state
```

### 4. Finalize Node

**Purpose**: Create final structured output

```python
def _finalize_node(self, state: ResearchState) -> ResearchState:
    logger.info("Finalizing research output")

    final_output = {
        "summary": state["synthesized_findings"].get("summary", ""),
        "key_findings": state["synthesized_findings"].get("key_findings", []),
        "sources": state["raw_research_data"].get("sources", []),
        "timestamp": datetime.now().isoformat(),
        "errors": state.get("errors", [])
    }

    state["final_output"] = final_output
    state["current_step"] = ResearchStep.COMPLETE

    return state
```

---

## Usage Guide

### Basic Usage (Backward Compatible)

The external API remains unchanged for easy migration:

```python
from src.agents import run_research_agent_langgraph

# Same API as legacy implementation
result = run_research_agent_langgraph(
    query="What are the GDPR requirements for AI systems?",
    focus_areas=["GDPR", "AI Act"],
    model_name="gpt-4o-mini"
)

print(result["summary"])
print(result["key_findings"])
```

### Advanced Usage (Direct Orchestrator)

For more control, use the `ResearchOrchestrator` class directly:

```python
from src.agents.research_agent_langgraph import ResearchOrchestrator

# Create orchestrator instance
orchestrator = ResearchOrchestrator(model_name="gpt-4o-mini")

# Run research
result = orchestrator.run(
    query="What are the transparency requirements under EU AI Act?",
    focus_areas=["AI Act", "Transparency"]
)

# Access detailed state information
if result.get("errors"):
    print(f"Errors encountered: {result['errors']}")

print(f"Research completed at: {result['timestamp']}")
```

---

## Migration Checklist

### For Developers

- [ ] Review new `research_agent_langgraph.py` implementation
- [ ] Understand `ResearchState` TypedDict structure
- [ ] Familiarize with workflow nodes and their purposes
- [ ] Test backward compatibility with existing code
- [ ] Update imports to use new implementation
- [ ] Review error handling in each node

### For Project Updates

- [ ] Update import statements in dependent files
- [ ] Replace `from src.agents import run_research_agent` with:
  - `from src.agents import run_research_agent_langgraph` (new)
  - Or keep using `run_research_agent` (legacy, still works)
- [ ] Test all research agent functionality
- [ ] Verify API responses match expected format
- [ ] Update any custom error handling logic

---

## Extending the Workflow

### Adding a New Node

Example: Add a validation node before finalization

```python
# 1. Add node method
def _validate_node(self, state: ResearchState) -> ResearchState:
    """Validate research results before finalization"""
    logger.info("Validating research results")

    # Validation logic
    if not state["raw_research_data"].get("sources"):
        state["errors"].append("No sources found in research")

    return state

# 2. Update workflow
def _build_workflow(self) -> StateGraph:
    workflow = StateGraph(ResearchState)

    workflow.add_node("initialize", self._initialize_node)
    workflow.add_node("research", self._research_node)
    workflow.add_node("synthesize", self._synthesize_node)
    workflow.add_node("validate", self._validate_node)  # NEW
    workflow.add_node("finalize", self._finalize_node)

    workflow.set_entry_point("initialize")
    workflow.add_edge("initialize", "research")
    workflow.add_edge("research", "synthesize")
    workflow.add_edge("synthesize", "validate")  # NEW
    workflow.add_edge("validate", "finalize")    # NEW
    workflow.add_edge("finalize", END)

    return workflow.compile()
```

### Adding Conditional Edges

Example: Retry research if synthesis fails

```python
def _should_retry_research(state: ResearchState) -> str:
    """Determine next step based on synthesis results"""
    if "error" in state["synthesized_findings"] and state.get("retry_count", 0) < 2:
        return "research"  # Retry
    return "finalize"     # Continue

# Update workflow
workflow.add_conditional_edges(
    "synthesize",
    _should_retry_research,
    {
        "research": "research",
        "finalize": "finalize"
    }
)
```

---

## Error Handling

### State-Tracked Errors

All errors are captured in `state["errors"]` list:

```python
try:
    # Node logic
    result = perform_operation()
except Exception as e:
    logger.error(f"Operation failed: {e}")
    state["errors"].append(f"Node error: {str(e)}")
    # Set fallback data
    state["data"] = {"error": str(e)}
```

### Accessing Errors in Results

```python
result = run_research_agent_langgraph(query="...")

if result.get("errors"):
    print("Errors encountered during research:")
    for error in result["errors"]:
        print(f"  - {error}")
```

---

## Performance Considerations

### Async Support

The workflow supports async execution:

```python
async def async_research():
    orchestrator = ResearchOrchestrator()
    result = await orchestrator.workflow.ainvoke(initial_state)
    return result
```

### Parallel Node Execution

While the current implementation uses a linear workflow, LangGraph supports parallel execution:

```python
# Example: Run multiple research queries in parallel
workflow.add_edge("initialize", "research_gdpr")
workflow.add_edge("initialize", "research_ai_act")
workflow.add_edge("research_gdpr", "merge")
workflow.add_edge("research_ai_act", "merge")
```

---

## Testing

### Unit Testing Nodes

```python
import pytest
from src.agents.research_agent_langgraph import ResearchOrchestrator

def test_initialize_node():
    orchestrator = ResearchOrchestrator()
    state = {
        "messages": [],
        "query": "Test query",
        "focus_areas": ["GDPR"],
        "errors": []
    }

    result_state = orchestrator._initialize_node(state)

    assert result_state["current_step"] == "initialization"
    assert len(result_state["messages"]) > 0
```

### Integration Testing

```python
def test_full_workflow():
    result = run_research_agent_langgraph(
        query="What are GDPR requirements?",
        focus_areas=["GDPR"]
    )

    assert "summary" in result
    assert "key_findings" in result
    assert isinstance(result.get("errors", []), list)
```

---

## Troubleshooting

### Common Issues

**Issue**: `ImportError: cannot import name 'ResearchOrchestrator'`
- **Solution**: Ensure you're importing from `research_agent_langgraph`, not `research_agent`

**Issue**: `TypeError: 'ResearchState' object is not subscriptable`
- **Solution**: Ensure state is properly initialized as a dict, not a TypedDict instance

**Issue**: Workflow hangs or doesn't complete
- **Solution**: Check that all edges are properly defined and lead to END

---

## Future Improvements

### Planned Enhancements

1. **Streaming Support**: Stream intermediate results as they become available
2. **Caching**: Cache research results for repeated queries
3. **Multi-source Research**: Parallel research across multiple sources
4. **Quality Scoring**: Add validation node to score research quality
5. **Human-in-the-Loop**: Add approval nodes for critical decisions

---

## References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain v1.0 Migration Guide](https://python.langchain.com/docs/guides/development/migrating_1_0/)
- [Compliance Orchestrator Implementation](../src/agents/compliance_orchestrator.py)
- [Research Agent Legacy Code](../src/agents/research_agent.py)

---

## Support

For questions or issues with the migration:

1. Review this migration guide
2. Check the example comparison script: `examples/research_agent_comparison.py`
3. Consult the LangGraph documentation
4. Review the ComplianceOrchestrator implementation for reference patterns

---

**Last Updated**: 2025-10-08
**Migration Status**: Complete
**Legacy Support**: Maintained (both implementations available)
