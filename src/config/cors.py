"""Credential-safe CORS configuration."""

from __future__ import annotations

import os


DEFAULT_CORS_ORIGINS = (
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def configured_cors_origins(value: str | None = None) -> list[str]:
    """Parse an explicit allow-list and reject credential-unsafe wildcards."""

    configured = value if value is not None else os.getenv(
        "CORS_ALLOWED_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)
    )
    origins = list(dict.fromkeys(
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    ))
    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS må ikke være tom")
    if "*" in origins:
        raise ValueError("CORS wildcard er ikke tilladt, når credentials er aktiveret")
    return origins
