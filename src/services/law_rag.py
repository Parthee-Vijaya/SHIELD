"""Lov-RAG — semantic search across Danish laws using embeddings.

Why a new module instead of reusing src/database/vector_store.py:
The existing vector_store.py speaks Qdrant. For our scope (~7 laws,
~70 chunks), an external Qdrant server is overkill — slower to set up
than the work it saves. This module embeds laws once into a local
JSON file and does cosine search in-memory with numpy. Same public API
as a real vector store so swapping to Qdrant later is local.

Index location: data/law_embeddings.json
Embedding provider: Azure OpenAI (if configured) → standard OpenAI fallback.
Cost: ~$0.0001 to (re)build the entire index — trivial.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

from src.law.law_data import get_all_laws

logger = logging.getLogger(__name__)


INDEX_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "law_embeddings.json"
INDEX_VERSION = 1
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"


# ---- Chunking --------------------------------------------------------------

@dataclass
class LawChunk:
    """One searchable slice of a law. Multiple chunks per law."""

    law_slug: str
    law_title: str
    law_url: str
    chunk_index: int
    text: str

    def to_dict(self) -> dict:
        return {
            "law_slug": self.law_slug,
            "law_title": self.law_title,
            "law_url": self.law_url,
            "chunk_index": self.chunk_index,
            "text": self.text,
        }


def _chunk_text(text: str, target_chars: int = 600, overlap: int = 80) -> list[str]:
    """Split text on paragraph boundaries, packed into ~target_chars chunks.

    Preserves natural sentence/paragraph breaks. Adds overlap between chunks
    so a query that lands on a chunk boundary still hits both sides.
    """
    if not text:
        return []
    text = text.replace("\\n", "\n")
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        candidate = (buf + " " + para).strip() if buf else para
        if len(candidate) <= target_chars:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
            tail = buf[-overlap:] if overlap and len(buf) > overlap else ""
            buf = (tail + " " + para).strip() if tail else para
        else:
            # single paragraph longer than target — emit as-is, don't try to split mid-sentence
            chunks.append(para)
            buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def _laws_to_chunks(laws: Iterable[dict]) -> list[LawChunk]:
    out: list[LawChunk] = []
    for law in laws:
        content = law.get("content") or ""
        title = law.get("title") or law.get("slug") or "Ukendt lov"
        slug = law.get("slug") or ""
        url = law.get("url") or ""
        # Always include the title + summary as a chunk so queries that
        # match the law name (without quoting body text) also rank it.
        header = f"{title}. {law.get('summary') or ''}".strip()
        if header:
            out.append(LawChunk(slug, title, url, 0, header))
        for i, piece in enumerate(_chunk_text(content), start=1):
            out.append(LawChunk(slug, title, url, i, piece))
    return out


# ---- Embedding provider ----------------------------------------------------

_PLACEHOLDER_FRAGMENTS = ("your_", "_here", "sk-...", "changeme")


def _is_placeholder(value: Optional[str]) -> bool:
    """Heuristic to skip dummy values left over from .env.example."""
    if not value:
        return True
    low = value.lower()
    return any(frag in low for frag in _PLACEHOLDER_FRAGMENTS)


class _EmbeddingClient:
    """Thin wrapper picking Azure OpenAI → OpenAI → LM Studio (local).

    Order matters: Azure is preferred for production credentials, OpenAI is
    the standard fallback, and LM Studio is the local-dev path used when
    neither cloud key is real (the .env.example ships with placeholders).
    Synchronous — call from asyncio.to_thread on the request path.
    """

    def __init__(self) -> None:
        self.azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.azure_api_key = os.getenv("AZURE_OPENAI_API_KEY")
        self.azure_api_version = os.getenv("OPENAI_API_VERSION", "2024-02-15-preview")
        # Embeddings are a separate Azure deployment from chat — assume the
        # operator names it after the model unless overridden.
        self.azure_embedding_deployment = (
            os.getenv("AZURE_EMBEDDING_DEPLOYMENT")
            or os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
            or DEFAULT_EMBEDDING_MODEL
        )

        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.embedding_model = os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)

        self.lm_studio_url = os.getenv("LM_STUDIO_BASE_URL", "").rstrip("/")
        self.lm_studio_embedding_model = os.getenv(
            "LM_STUDIO_EMBEDDING_MODEL", "text-embedding-nomic-embed-text-v1.5"
        )

        # Pick provider in priority order
        if self.azure_endpoint and not _is_placeholder(self.azure_api_key):
            self.provider = "azure"
        elif not _is_placeholder(self.openai_api_key):
            self.provider = "openai"
        elif self.lm_studio_url:
            self.provider = "lm_studio"
        else:
            self.provider = None

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self.provider == "azure":
            return self._embed_azure(texts)
        if self.provider == "openai":
            return self._embed_openai(texts)
        if self.provider == "lm_studio":
            return self._embed_lm_studio(texts)
        raise RuntimeError(
            "No embedding provider configured — set AZURE_OPENAI_API_KEY, "
            "OPENAI_API_KEY, or LM_STUDIO_BASE_URL"
        )

    def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        from openai import OpenAI

        client = OpenAI(api_key=self.openai_api_key)
        resp = client.embeddings.create(model=self.embedding_model, input=texts)
        return [item.embedding for item in resp.data]

    def _embed_azure(self, texts: list[str]) -> list[list[float]]:
        from openai import AzureOpenAI

        client = AzureOpenAI(
            api_key=self.azure_api_key,
            api_version=self.azure_api_version,
            azure_endpoint=self.azure_endpoint,
        )
        resp = client.embeddings.create(model=self.azure_embedding_deployment, input=texts)
        return [item.embedding for item in resp.data]

    def _embed_lm_studio(self, texts: list[str]) -> list[list[float]]:
        # LM Studio exposes an OpenAI-compatible endpoint. Use the OpenAI
        # SDK with base_url override — it also handles batching for us.
        from openai import OpenAI

        client = OpenAI(api_key="lm-studio", base_url=self.lm_studio_url)
        resp = client.embeddings.create(model=self.lm_studio_embedding_model, input=texts)
        return [item.embedding for item in resp.data]

    def provider_label(self) -> str:
        return self.provider or "none"

    def model_label(self) -> str:
        if self.provider == "azure":
            return self.azure_embedding_deployment
        if self.provider == "openai":
            return self.embedding_model
        if self.provider == "lm_studio":
            return self.lm_studio_embedding_model
        return "unknown"


# ---- Index ------------------------------------------------------------------

@dataclass
class _IndexBlob:
    chunks: list[LawChunk]
    embeddings: np.ndarray  # shape (n_chunks, dim)
    provider: str
    model: str
    built_at: str


class LawRAG:
    """In-memory cosine-search index over Danish laws.

    Lifecycle:
        rag = LawRAG()
        if not rag.is_ready():
            rag.build()                          # ~$0.0001, ~5s
        hits = rag.search("query", top_k=5)
    """

    def __init__(self, index_path: Path = INDEX_FILE) -> None:
        self.index_path = index_path
        self._blob: Optional[_IndexBlob] = None

    # -- read --

    def is_ready(self) -> bool:
        return self.index_path.exists()

    def _load(self) -> _IndexBlob:
        if self._blob is not None:
            return self._blob
        if not self.is_ready():
            raise RuntimeError(
                f"Law RAG index not built yet. Call build() or POST /api/law/rag/build."
            )
        with self.index_path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
        chunks = [
            LawChunk(
                law_slug=c["law_slug"],
                law_title=c["law_title"],
                law_url=c["law_url"],
                chunk_index=c["chunk_index"],
                text=c["text"],
            )
            for c in payload["chunks"]
        ]
        embeddings = np.asarray(payload["embeddings"], dtype=np.float32)
        # L2-normalize once at load — turns cosine into a dot product
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        embeddings = embeddings / norms
        self._blob = _IndexBlob(
            chunks=chunks,
            embeddings=embeddings,
            provider=payload.get("provider", "unknown"),
            model=payload.get("model", "unknown"),
            built_at=payload.get("built_at", ""),
        )
        return self._blob

    def stats(self) -> dict:
        if not self.is_ready():
            return {"ready": False}
        blob = self._load()
        per_law: dict[str, int] = {}
        for c in blob.chunks:
            per_law[c.law_slug] = per_law.get(c.law_slug, 0) + 1
        return {
            "ready": True,
            "chunks": len(blob.chunks),
            "laws": len(per_law),
            "per_law": per_law,
            "provider": blob.provider,
            "model": blob.model,
            "built_at": blob.built_at,
            "dim": int(blob.embeddings.shape[1]),
        }

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """Embed query and return top_k chunks ordered by cosine similarity."""
        if not query.strip():
            return []
        blob = self._load()
        client = _EmbeddingClient()
        q_vec = np.asarray(client.embed_batch([query])[0], dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []
        q_vec = q_vec / q_norm
        # blob.embeddings is already L2-normalized → dot is cosine
        sims = blob.embeddings @ q_vec
        # argpartition is faster than full sort for small k
        if top_k >= len(sims):
            order = np.argsort(-sims)
        else:
            top_idx = np.argpartition(-sims, top_k)[:top_k]
            order = top_idx[np.argsort(-sims[top_idx])]
        out: list[dict] = []
        for idx in order[:top_k]:
            chunk = blob.chunks[int(idx)]
            out.append(
                {
                    "law_slug": chunk.law_slug,
                    "law_title": chunk.law_title,
                    "law_url": chunk.law_url,
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "similarity": float(sims[idx]),
                }
            )
        return out

    # -- write --

    def build(self, batch_size: int = 50) -> dict:
        """Embed every law section and persist the index. Idempotent."""
        laws = get_all_laws()
        chunks = _laws_to_chunks(laws)
        if not chunks:
            raise RuntimeError("No law content available to embed")

        client = _EmbeddingClient()
        all_vecs: list[list[float]] = []
        t0 = time.monotonic()
        for start in range(0, len(chunks), batch_size):
            batch = [c.text for c in chunks[start : start + batch_size]]
            vecs = client.embed_batch(batch)
            all_vecs.extend(vecs)
            logger.info(
                "Embedded %d/%d law chunks via %s",
                len(all_vecs),
                len(chunks),
                client.provider_label(),
            )

        if len(all_vecs) != len(chunks):
            raise RuntimeError(
                f"Embedding count mismatch: {len(all_vecs)} vectors for {len(chunks)} chunks"
            )

        payload = {
            "version": INDEX_VERSION,
            "provider": client.provider_label(),
            "model": client.model_label(),
            "built_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
            "chunks": [c.to_dict() for c in chunks],
            "embeddings": all_vecs,
        }
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        with self.index_path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False)
        # Force reload from disk on next read
        self._blob = None
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.info("Built law RAG index: %d chunks in %dms", len(chunks), elapsed_ms)
        return {
            "chunks": len(chunks),
            "laws": len({c.law_slug for c in chunks}),
            "elapsed_ms": elapsed_ms,
            "provider": payload["provider"],
            "model": payload["model"],
        }


# Module-level singleton — cheap to instantiate but the index in memory
# is shared across requests. The first request that needs it triggers _load().
_default_index: Optional[LawRAG] = None


def get_default_index() -> LawRAG:
    global _default_index
    if _default_index is None:
        _default_index = LawRAG()
    return _default_index
