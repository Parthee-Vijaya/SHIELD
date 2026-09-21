"""Registry for agentkonfigurationer"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class AgentConfig(BaseModel):
    """Struktureret repræsentation af en agentrolle"""

    id: str
    name: str
    summary: str
    version: str = "0.1.0"
    model: Dict[str, object] = Field(default_factory=dict)
    objectives: List[str] = Field(default_factory=list)
    inputs: Dict[str, Dict[str, object]] = Field(default_factory=dict)
    outputs: Dict[str, Dict[str, object]] = Field(default_factory=dict)
    standards: Dict[str, object] = Field(default_factory=dict)
    workflow: Dict[str, object] = Field(default_factory=dict)


class AgentRegistry:
    """Loader og eksponerer agentkonfigurationer"""

    def __init__(self, config_dir: Path | str = Path("config/agents")) -> None:
        self.config_dir = Path(config_dir)
        self._agents: Dict[str, AgentConfig] = {}
        self.reload()

    def reload(self) -> None:
        """Genindlæs agentdefinitioner fra YAML filer"""
        if not self.config_dir.exists():
            logger.warning("Agent config directory %s not found", self.config_dir)
            return

        self._agents.clear()
        for path in sorted(self.config_dir.glob("*.yml")):
            try:
                data = yaml.safe_load(path.read_text())
                if not data:
                    logger.warning("Skipping empty agent config: %s", path)
                    continue
                config = AgentConfig.model_validate(data)
                self._agents[config.id] = config
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.error("Failed to load agent config %s: %s", path, exc)

    def list_agents(self) -> List[AgentConfig]:
        return list(self._agents.values())

    def get(self, agent_id: str) -> Optional[AgentConfig]:
        return self._agents.get(agent_id)

    def ensure(self, agent_id: str) -> AgentConfig:
        config = self.get(agent_id)
        if not config:
            raise KeyError(f"Agent '{agent_id}' er ikke registreret")
        return config


@lru_cache(maxsize=1)
def get_agent_registry() -> AgentRegistry:
    """Singleton-adgang til agentregistry"""
    return AgentRegistry()


__all__ = ["AgentConfig", "AgentRegistry", "get_agent_registry"]
