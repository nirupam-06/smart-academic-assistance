"""
vector_store.py — FAISS-backed vector store with metadata.

Changes from hash-embedding version
────────────────────────────────────
1. DIM is imported from embeddings.py instead of hardcoded — single
   source of truth. If you ever swap models, you change DIM in one place.
2. IndexFlatIP is still the correct index for normalised vectors:
   inner product on unit vectors = cosine similarity. No change needed.
3. build_index() now validates that the supplied embeddings array has
   the correct second dimension and raises early with a clear message.
4. search() returns the distance/score alongside metadata so callers
   can optionally filter by confidence threshold.
5. Everything else is identical to the original — no migration needed
   for the FAISS index file format.

Migration note
──────────────
Existing faiss.index and metadata.json files from the hash-embedding era
are INCOMPATIBLE (different vector space — hashes are not comparable to
transformer embeddings). The migrate.py script handles the re-indexing.
"""

from __future__ import annotations

import json
import logging
import os

import faiss
import numpy as np

from embeddings import DIM

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────

DATA_DIR   = os.environ.get("DATA_DIR", "data")
INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")
META_PATH  = os.path.join(DATA_DIR, "metadata.json")

# ── In-process state ──────────────────────────────────────────────────────────

_index: faiss.IndexFlatIP | None = None
_metadata: list[dict] = []  # [{text, source, chunk_index, embedding}]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_index() -> faiss.IndexFlatIP:
    global _index
    if _index is None:
        _index = faiss.IndexFlatIP(DIM)
    return _index


def _validate_embeddings(embeddings: np.ndarray, context: str = "") -> None:
    if embeddings.ndim != 2:
        raise ValueError(
            f"{context}: embeddings must be 2-D, got shape {embeddings.shape}"
        )
    if embeddings.shape[1] != DIM:
        raise ValueError(
            f"{context}: embedding dim {embeddings.shape[1]} != expected {DIM}. "
            f"Did you mix hash embeddings with transformer embeddings? "
            f"Run migrate.py to re-index existing documents."
        )


# ── Public API ────────────────────────────────────────────────────────────────

def build_index(chunks: list[str], embeddings: np.ndarray, source: str) -> None:
    """
    Replace all chunks for this source and rebuild the FAISS index cleanly.

    Steps
    -----
    1. Drop all existing metadata entries for this source.
    2. Append new chunks with their embeddings.
    3. Rebuild the FAISS index from scratch using all stored embeddings.

    Why rebuild from scratch instead of incremental FAISS.add()? Because
    FAISS IndexFlatIP does not support deletion. Re-uploading a document
    would otherwise accumulate stale vectors. For a deployment with <50k
    chunks, a full rebuild takes <100 ms and is the correct approach.
    """
    global _index, _metadata

    _validate_embeddings(embeddings, context=f"build_index({source})")

    # 1. Remove stale entries for this source
    _metadata = [m for m in _metadata if m["source"] != source]
    logger.info("Removed existing chunks for source '%s'. Total remaining: %d", source, len(_metadata))

    # 2. Append new entries (store embedding as list for JSON serialisation)
    for i, chunk in enumerate(chunks):
        _metadata.append({
            "text":        chunk,
            "source":      source,
            "chunk_index": i,
            "embedding":   embeddings[i].tolist(),
        })

    # 3. Full FAISS rebuild
    _index = faiss.IndexFlatIP(DIM)
    if _metadata:
        all_embeddings = np.array(
            [m["embedding"] for m in _metadata], dtype=np.float32
        )
        _validate_embeddings(all_embeddings, context="build_index rebuild")
        _index.add(all_embeddings)

    logger.info(
        "Index rebuilt for source '%s'. Chunks added: %d. Total vectors: %d",
        source, len(chunks), _index.ntotal
    )


def search(query_embedding: np.ndarray, top_k: int = 5) -> list[dict]:
    """
    Return top-k metadata dicts with an added 'score' field.

    'score' is the inner product (= cosine similarity for normalised
    vectors). Range: [-1, 1]. Typical useful results are > 0.3.

    Parameters
    ----------
    query_embedding : shape (1, DIM), normalised float32
    top_k           : number of results to return

    Returns
    -------
    list of dicts, each containing: text, source, chunk_index, score
    """
    idx = _get_index()
    if idx.ntotal == 0:
        return []

    _validate_embeddings(query_embedding, context="search()")

    k = min(top_k, idx.ntotal)
    distances, indices = idx.search(query_embedding, k)

    results = []
    for score, i in zip(distances[0], indices[0]):
        if i < len(_metadata):
            entry = dict(_metadata[i])        # shallow copy — don't mutate cache
            entry.pop("embedding", None)       # don't send raw vectors to callers
            entry["score"] = float(score)
            results.append(entry)

    return results


def get_sources() -> list[str]:
    """Return a deduplicated list of all indexed source document names."""
    return list({m["source"] for m in _metadata})


def chunk_count_for_source(source: str) -> int:
    """Return the number of indexed chunks for a given source."""
    return sum(1 for m in _metadata if m["source"] == source)


def save() -> None:
    """Persist FAISS index and metadata to disk."""
    os.makedirs(DATA_DIR, exist_ok=True)
    faiss.write_index(_get_index(), INDEX_PATH)
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(_metadata, f, ensure_ascii=False)
    logger.info("Vector store saved. vectors=%d", _get_index().ntotal)


def load() -> bool:
    """
    Load FAISS index and metadata from disk.

    Returns True if data was found and loaded, False if no index exists yet.
    Raises ValueError if the loaded index has wrong dimensionality
    (indicating a stale hash-embedding index — run migrate.py).
    """
    global _index, _metadata

    if not os.path.exists(INDEX_PATH):
        logger.info("No existing index found at %s. Starting fresh.", INDEX_PATH)
        return False

    _index = faiss.read_index(INDEX_PATH)

    # Detect stale hash-embedding index
    if _index.d != DIM:
        raise ValueError(
            f"Loaded FAISS index has dim={_index.d} but current model uses dim={DIM}. "
            f"The stored index was built with the old MD5 hash encoder. "
            f"Run: python migrate.py  to re-index all documents."
        )

    with open(META_PATH, encoding="utf-8") as f:
        _metadata = json.load(f)

    logger.info(
        "Vector store loaded. vectors=%d, documents=%d",
        _index.ntotal, len(get_sources())
    )
    return True
