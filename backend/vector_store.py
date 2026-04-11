"""
vector_store.py — FAISS-backed vector store with metadata.
"""

import os, json, faiss, numpy as np

INDEX_PATH = "data/faiss.index"
META_PATH  = "data/metadata.json"
DIM        = 384  # all-MiniLM-L6-v2

_index: faiss.IndexFlatIP | None = None
_metadata: list[dict] = []          # [{text, source, chunk_index, embedding}]


def _get_index() -> faiss.IndexFlatIP:
    global _index
    if _index is None:
        _index = faiss.IndexFlatIP(DIM)
    return _index


def build_index(chunks: list[str], embeddings: np.ndarray, source: str) -> None:
    """Replace all chunks for this source and rebuild the FAISS index cleanly."""
    global _index, _metadata

    # 1. Drop all existing entries for this source
    _metadata = [m for m in _metadata if m["source"] != source]

    # 2. Append new chunks (store embedding so we can rebuild later)
    for i, chunk in enumerate(chunks):
        _metadata.append({
            "text":        chunk,
            "source":      source,
            "chunk_index": i,
            "embedding":   embeddings[i].tolist(),
        })

    # 3. Rebuild FAISS index from all metadata embeddings
    _index = faiss.IndexFlatIP(DIM)
    all_embeddings = np.array(
        [m["embedding"] for m in _metadata], dtype=np.float32
    )
    _index.add(all_embeddings)


def search(query_embedding: np.ndarray, top_k: int = 5) -> list[dict]:
    """Return top-k metadata dicts [{text, source}]."""
    idx = _get_index()
    if idx.ntotal == 0:
        return []
    k = min(top_k, idx.ntotal)
    _, indices = idx.search(query_embedding, k)
    return [_metadata[i] for i in indices[0] if i < len(_metadata)]


def save() -> None:
    os.makedirs("data", exist_ok=True)
    faiss.write_index(_get_index(), INDEX_PATH)
    with open(META_PATH, "w") as f:
        json.dump(_metadata, f)


def load() -> bool:
    global _index, _metadata
    if not os.path.exists(INDEX_PATH):
        return False
    _index = faiss.read_index(INDEX_PATH)
    with open(META_PATH) as f:
        _metadata = json.load(f)
    return True
