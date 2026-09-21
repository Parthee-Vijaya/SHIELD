"""
Test script to verify parallel execution of AI Act and GDPR checks
This demonstrates the performance improvement from parallel execution
"""

import asyncio
import sys
import os
from datetime import datetime

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.agents.compliance_orchestrator import ComplianceOrchestrator
from src.core.models import ProjectInput, AISystemType


async def test_sequential_execution():
    """Test with sequential execution (legacy mode)"""
    print("\n" + "="*70)
    print("TESTING SEQUENTIAL EXECUTION (Legacy Mode)")
    print("="*70)

    # Create orchestrator with sequential execution
    orchestrator = ComplianceOrchestrator(enable_parallel_execution=False)

    # Create a simple test project
    project = ProjectInput(
        name="Test AI Assistant",
        description="An AI chatbot for customer support in healthcare sector",
        sector="Healthcare",
        ai_type=AISystemType.GENERATIVE_AI,
        deployment_region=["Denmark", "EU"],
        use_case="Customer support and information retrieval",
        processes_personal_data=True,
        high_risk_areas=["Healthcare decisions"],
        user_interaction_type="Direct user interaction"
    )

    # Run analysis
    start_time = datetime.now()
    try:
        assessment = await orchestrator.analyze_project(project)
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        print(f"\n✓ Sequential execution completed in {duration:.2f} seconds")
        print(f"  - Project: {assessment.project_name}")
        print(f"  - Risk Level: {assessment.risk_level.value}")
        print(f"  - Compliance Score: {assessment.compliance_score:.1f}%")

        return duration

    except Exception as e:
        print(f"\n✗ Sequential execution failed: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_parallel_execution():
    """Test with parallel execution (new mode)"""
    print("\n" + "="*70)
    print("TESTING PARALLEL EXECUTION (New Mode)")
    print("="*70)

    # Create orchestrator with parallel execution
    orchestrator = ComplianceOrchestrator(enable_parallel_execution=True)

    # Create the same test project
    project = ProjectInput(
        name="Test AI Assistant",
        description="An AI chatbot for customer support in healthcare sector",
        sector="Healthcare",
        ai_type=AISystemType.GENERATIVE_AI,
        deployment_region=["Denmark", "EU"],
        use_case="Customer support and information retrieval",
        processes_personal_data=True,
        high_risk_areas=["Healthcare decisions"],
        user_interaction_type="Direct user interaction"
    )

    # Run analysis
    start_time = datetime.now()
    try:
        assessment = await orchestrator.analyze_project(project)
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        print(f"\n✓ Parallel execution completed in {duration:.2f} seconds")
        print(f"  - Project: {assessment.project_name}")
        print(f"  - Risk Level: {assessment.risk_level.value}")
        print(f"  - Compliance Score: {assessment.compliance_score:.1f}%")

        # Get performance metrics from the assessment
        if hasattr(assessment, 'ai_act_compliance'):
            # Look for performance metrics in the report
            print("\nPerformance Metrics:")
            print(f"  - Parallel execution was enabled")

        return duration

    except Exception as e:
        print(f"\n✗ Parallel execution failed: {e}")
        import traceback
        traceback.print_exc()
        return None


async def main():
    """Run both tests and compare results"""
    print("\n" + "="*70)
    print("COMPLIANCE ORCHESTRATOR - PARALLEL EXECUTION TEST")
    print("="*70)
    print("\nThis test compares sequential vs parallel execution of compliance checks")
    print("Parallel execution should complete faster by running AI Act and GDPR")
    print("checks simultaneously instead of one after the other.")

    # Test sequential execution
    sequential_time = await test_sequential_execution()

    # Wait a moment between tests
    await asyncio.sleep(2)

    # Test parallel execution
    parallel_time = await test_parallel_execution()

    # Compare results
    print("\n" + "="*70)
    print("COMPARISON RESULTS")
    print("="*70)

    if sequential_time and parallel_time:
        time_saved = sequential_time - parallel_time
        percent_improvement = (time_saved / sequential_time) * 100

        print(f"\nSequential execution: {sequential_time:.2f}s")
        print(f"Parallel execution:   {parallel_time:.2f}s")
        print(f"\nTime saved: {time_saved:.2f}s ({percent_improvement:.1f}% improvement)")

        if time_saved > 0:
            print("\n✓ Parallel execution is FASTER!")
        elif time_saved < 0:
            print("\n⚠ Parallel execution was slower (this can happen with small workloads)")
        else:
            print("\n○ Both executions took the same time")
    else:
        print("\n✗ Could not compare - one or both tests failed")

    print("\n" + "="*70)
    print("TEST COMPLETE")
    print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
