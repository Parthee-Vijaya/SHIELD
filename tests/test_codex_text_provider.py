"""Local text provider boundaries; no real model or credentials in unit tests."""

import json
from pathlib import Path
import subprocess
from unittest.mock import Mock

import pytest
from src.services import codex_text_provider as provider


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setenv("SHIELD_ENABLE_CODEX_LOCAL", "true")
    monkeypatch.setattr(provider.shutil, "which", lambda _: "/usr/local/bin/codex")


def fake_process(
    monkeypatch, events=None, returncode=0, answer="Et kildebaseret svar."
):
    calls = []

    def start(command, **kwargs):
        calls.append((command, kwargs))
        Path(command[command.index("--output-last-message") + 1]).write_text(answer)
        process = Mock(returncode=returncode, pid=43210)
        process.communicate.return_value = (
            "\n".join(
                json.dumps(event) for event in (events or [{"type": "turn.completed"}])
            ),
            None,
        )
        return process

    monkeypatch.setattr(provider.subprocess, "Popen", start)
    return calls


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SHIELD_ENABLE_CODEX_LOCAL", raising=False)
    assert not provider.is_available()
    with pytest.raises(provider.CodexTextError, match="ikke aktiveret"):
        provider.generate_text("Instructions", "Question")


def test_isolated_text_invocation_and_cleanup(enabled, monkeypatch):
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "test-only-sensitive-value")
    monkeypatch.setenv("CODEX_THREAD_ID", "parent-id")
    calls = fake_process(monkeypatch)
    assert (
        provider.generate_text("Kun kilder.", "Hvad mangler?", 1000)
        == "Et kildebaseret svar."
    )
    command, kwargs = calls[0]
    assert command[command.index("--model") + 1] == "gpt-5.6-sol"
    for flag in [
        "--ignore-user-config",
        "--ignore-rules",
        "--ephemeral",
        "read-only",
        "shell_tool",
        "plugins",
        "apps",
        'web_search="disabled"',
    ]:
        assert flag in command
    assert kwargs["stderr"] == subprocess.DEVNULL
    assert kwargs["start_new_session"] is True
    assert "AI_GATEWAY_API_KEY" not in kwargs["env"]
    assert "CODEX_THREAD_ID" not in kwargs["env"]
    assert not Path(command[command.index("--cd") + 1]).exists()


@pytest.mark.parametrize(
    "events",
    [
        [
            {"type": "item.completed", "item": {"type": "command_execution"}},
            {"type": "turn.completed"},
        ],
        [
            {"type": "item.completed", "item": {"type": "mcp_tool_call"}},
            {"type": "turn.completed"},
        ],
        [{"type": "turn.failed"}],
        [{"type": "item.completed", "item": {"type": "agent_message"}}],
    ],
)
def test_rejects_tools_and_incomplete_turns(enabled, monkeypatch, events):
    fake_process(monkeypatch, events=events)
    with pytest.raises(provider.CodexTextError):
        provider.generate_text("Instruction", "Question")


def test_rejects_nonzero_exit_or_empty_answer(enabled, monkeypatch):
    fake_process(monkeypatch, returncode=1)
    with pytest.raises(provider.CodexTextError):
        provider.generate_text("Instruction", "Question")
    fake_process(monkeypatch, answer=" ")
    with pytest.raises(provider.CodexTextError):
        provider.generate_text("Instruction", "Question")


def test_timeout_terminates_process_group_and_releases_gate(enabled, monkeypatch):
    process = Mock(pid=12345)
    process.communicate.side_effect = [
        subprocess.TimeoutExpired("codex", 150),
        ("", None),
    ]
    monkeypatch.setattr(provider.subprocess, "Popen", lambda *a, **kw: process)
    kill = Mock()
    monkeypatch.setattr(provider.os, "killpg", kill)
    with pytest.raises(provider.CodexTextError, match="tidsgrænsen"):
        provider.generate_text("Instruction", "Question")
    kill.assert_called_once_with(12345, provider.signal.SIGKILL)
    assert provider._gate.acquire(blocking=False)
    assert provider._gate.acquire(blocking=False)
    provider._gate.release()
    provider._gate.release()


def test_rejects_oversized_input_before_spawning(enabled, monkeypatch):
    start = Mock()
    monkeypatch.setattr(provider.subprocess, "Popen", start)
    with pytest.raises(provider.CodexTextError, match="for stort"):
        provider.generate_text("Instruction", "x" * provider.MAX_INPUT_CHARS)
    start.assert_not_called()
