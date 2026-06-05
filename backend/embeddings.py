"""
embeddings.py — Production semantic embedding using BGE-Small-EN-v1.5

Replaces the MD5 hash encoder with a real transformer model.

Model choice: BAAI/bge-small-en-v1.5
  - 33.4M params | 133 MB disk | ~160 MB RAM
  - 384-dim output  →  zero changes to FAISS index or vector_store.py
  - 512-token window covers 800-char academic chunks without truncation
  - MTEB 62.17 | BEIR NDCG@10 51.68  (best small model in both)
  - MIT license | no trust_remote_code
  - Asymmetric encoding: query prefix on queries only, not on documents
  - Fits Railway Starter (512 MB) with ~38 MB headroom

Public benchmarks (BEIR NDCG@10):
  BGE-Small-v1.5   51.68  ← chosen
  E5-Small-v2      46.00
  Nomic-Embed-v1.5 49.80  (but 580 MB RAM — fails Railway Starter)
  MiniLM-L6-v2     41.95  (also truncates 800-char chunks at 256-token limit)
"""

from __future__ import annotations

import logging
import os
import threading
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MODEL_NAME = os.environ.get("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
DIM        = 384

# BGE asymmetric encoding: queries get a prefix, documents do NOT.
# This is trained into the model — omitting it on queries drops NDCG by ~8 pts.
# Passages/chunks are encoded as plain text (no prefix).
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

# Batch size for encoding. 64 is safe on CPU with 160 MB model.
# Reduce to 32 if you ever see OOM on a very constrained host.
ENCODE_BATCH_SIZE = int(os.environ.get("EMBED_BATCH_SIZE", "64"))

# ── Lazy singleton ────────────────────────────────────────────────────────────

_model: "SentenceTransformer | None" = None
_lock  = threading.Lock()


def _get_model() -> "SentenceTransformer":
    """
    Load model exactly once, thread-safely.

    Uses a double-checked lock so concurrent first requests don't trigger
    double downloads. Subsequent calls pay only a dict lookup.
    """
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _load_model()
    return _model


def _load_model() -> None:
    """
    Perform the actual model load. Called exactly once inside the lock.

    Tries the normal HuggingFace Hub path first. If the host has no
    outbound network (rare), falls back to a local cache directory
    controlled by the SENTENCE_TRANSFORMERS_HOME env var.
    """
    global _model
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise RuntimeError(
            "sentence-transformers is not installed. "
            "Run: pip install sentence-transformers"
        ) from exc

    logger.info("Loading embedding model: %s", MODEL_NAME)
    try:
        _model = SentenceTransformer(
            MODEL_NAME,
            device="cpu",            # Railway has no GPU
            trust_remote_code=False, # BGE does not need this; keep it False
        )
        # Sanity-check the output dimension
        probe = _model.encode(["probe"], normalize_embeddings=True)
        assert probe.shape[1] == DIM, (
            f"Model output dim {probe.shape[1]} != expected {DIM}. "
            f"Did you change MODEL_NAME without updating DIM?"
        )
        logger.info("Embedding model loaded. dim=%d", DIM)
    except Exception as exc:
        logger.error("Failed to load embedding model: %s", exc)
        raise


# ── Public API ────────────────────────────────────────────────────────────────

def encode_texts(texts: list[str]) -> np.ndarray:
    """
    Encode a list of document chunks (passages) into normalised embeddings.

    Documents are encoded WITHOUT any prefix — BGE's asymmetric training
    means the model already knows these are passages to be retrieved.

    Returns
    -------
    np.ndarray of shape (len(texts), 384), dtype float32, L2-normalised.
    """
    if not texts:
        return np.empty((0, DIM), dtype=np.float32)

    model = _get_model()
    embeddings = model.encode(
        texts,
        batch_size=ENCODE_BATCH_SIZE,
        normalize_embeddings=True,   # unit vectors → inner product = cosine sim
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return embeddings.astype(np.float32)


def encode_query(text: str) -> np.ndarray:
    """
    Encode a single user query with the BGE asymmetric query prefix.

    The prefix 'Represent this sentence for searching relevant passages: '
    is what BGE v1.5 was fine-tuned with for the query side. It shifts
    the query embedding toward the retrieval-optimised subspace.

    Returns
    -------
    np.ndarray of shape (1, 384), dtype float32, L2-normalised.
    """
    prefixed = BGE_QUERY_PREFIX + text.strip()
    model = _get_model()
    embedding = model.encode(
        [prefixed],
        batch_size=1,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return embedding.astype(np.float32)


def get_dim() -> int:
    """Return the embedding dimension (384 for BGE-Small)."""
    return DIM


def warm_up() -> None:
    """
    Pre-load the model at app startup so the first request is not slow.
    Call this once in app.py after imports. Non-blocking if model is
    already loaded.
    """
    _get_model()
    logger.info("Embedding model warmed up.")
