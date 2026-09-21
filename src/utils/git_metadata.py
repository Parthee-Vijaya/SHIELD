"""Helpers for extracting git-based metadata for runtime telemetry."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from typing import Iterable, Literal, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MAJOR_TOKENS = (
    '#major',
    'breaking change',
    'breaking-change',
    'major release',
    'overhaul',
    'rewrite',
    '!!',
)
MINOR_TOKENS = (
    '#minor',
    'feat',
    'feature',
    'improve',
    'enhance',
    'upgrade',
    'add ',
    'introduce',
    'refactor',
    'update',
)
PATCH_TOKENS = (
    '#patch',
    'fix',
    'bug',
    'patch',
    'chore',
    'docs',
    'typo',
)

CommitSize = Literal['major', 'minor', 'patch']


@dataclass(frozen=True)
class GitVersionInfo:
    """Structured representation of git version data."""

    version: str
    build_number: int
    last_change_type: CommitSize
    last_commit_hash: Optional[str]
    last_commit_short_hash: Optional[str]
    last_commit_message: Optional[str]
    last_commit_author: Optional[str]
    last_commit_timestamp: Optional[datetime]
    branch: Optional[str]

    def as_dict(self) -> dict[str, object]:
        """Serialize to JSON-friendly payload."""
        timestamp_iso = self.last_commit_timestamp.isoformat().replace('+00:00', 'Z') if self.last_commit_timestamp else None
        return {
            'version': self.version,
            'buildNumber': self.build_number,
            'lastChangeType': self.last_change_type,
            'lastCommit': {
                'hash': self.last_commit_hash,
                'shortHash': self.last_commit_short_hash,
                'message': self.last_commit_message,
                'author': self.last_commit_author,
                'timestamp': timestamp_iso,
            },
            'branch': self.branch,
            'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        }


def _run_git_command(args: Iterable[str]) -> str:
    """Execute a git command relative to the project root."""
    try:
        completed = subprocess.run(
            ['git', *args],
            cwd=PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return ''
    return completed.stdout.strip()


def _classify_commit(subject: str, body: str) -> CommitSize:
    """Infer semantic impact from commit messaging heuristics."""
    text = f"{subject}\n{body}".lower()
    header = subject.split(':', 1)[0]
    if '!' in header or any(token in text for token in MAJOR_TOKENS):
        return 'major'
    if any(token in text for token in MINOR_TOKENS):
        return 'minor'
    if any(token in text for token in PATCH_TOKENS):
        return 'patch'
    return 'patch'


def _calculate_semver() -> tuple[str, CommitSize]:
    """Traverse git history to build a semantic version string."""
    log_output = _run_git_command(['log', '--format=%s%x1f%b%x1e', '--reverse'])
    if not log_output:
        return '0.0.0', 'patch'

    major = minor = patch = 0
    last_change: CommitSize = 'patch'

    for record in log_output.split('\x1e'):
        if not record.strip():
            continue
        subject, _, body = record.partition('\x1f')
        change_type = _classify_commit(subject.strip(), body.strip())

        if change_type == 'major':
            major += 1
            minor = 0
            patch = 0
        elif change_type == 'minor':
            minor += 1
            patch = 0
        else:
            patch += 1

        last_change = change_type

    version = f"{major}.{minor}.{patch}"
    return version, last_change


def _get_last_commit_details() -> tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[datetime]]:
    """Fetch metadata for the most recent commit."""
    output = _run_git_command(['log', '-1', '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s', '--date=iso8601-strict'])
    if not output:
        return None, None, None, None, None

    parts = output.split('\x1f')
    if len(parts) != 5:
        return None, None, None, None, None

    full_hash, short_hash, author, timestamp_raw, message = (part.strip() or None for part in parts)
    last_commit_timestamp = None
    if timestamp_raw:
        try:
            last_commit_timestamp = datetime.fromisoformat(timestamp_raw.replace('Z', '+00:00')).astimezone(timezone.utc)
        except ValueError:
            last_commit_timestamp = None

    return full_hash, short_hash, author, message, last_commit_timestamp


def _get_current_branch() -> Optional[str]:
    """Get the current git branch name."""
    branch = _run_git_command(['branch', '--show-current'])
    return branch if branch else None


def _get_build_number() -> int:
    """Get total commit count as build number."""
    count_output = _run_git_command(['rev-list', '--count', 'HEAD'])
    if not count_output:
        return 1
    try:
        return int(count_output)
    except ValueError:
        return 1


def get_version_info() -> dict[str, object]:
    """Return git-driven version information suitable for APIs."""
    configured_version = os.getenv('APP_VERSION', '').strip()
    version, last_change = (
        (configured_version, 'patch')
        if configured_version
        else _calculate_semver()
    )
    commit_hash, short_hash, author, message, timestamp = _get_last_commit_details()
    branch = _get_current_branch()
    build_number = _get_build_number()

    info = GitVersionInfo(
        version=version,
        build_number=build_number,
        last_change_type=last_change,
        last_commit_hash=commit_hash,
        last_commit_short_hash=short_hash,
        last_commit_message=message,
        last_commit_author=author,
        last_commit_timestamp=timestamp,
        branch=branch,
    )
    return info.as_dict()
