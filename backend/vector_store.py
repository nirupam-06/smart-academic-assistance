"""
vector_store.py — FAISS-backed vector store with metadata.
"""

import os, json, faiss, numpy as np

INDEX_PATH = "data/faiss.index"
META_PATH  = "data/metadata.json"
DIM        = 384  # all-MiniLM-L6-v2

_index: faiss.IndexFlatIP | None = None
_metadata: list[dict] = []          # [{text, source}]


def _get_index() -> faiss.IndexFlatIP:
    global _index
    if _index is None:
        _index = faiss.IndexFlatIP(DIM)
    return _index


def build_index(chunks: list[str], embeddings: np.ndarray, source: str) -> None:
    """Add chunks + embeddings to the in-memory index."""
    idx = _get_index()
    idx.add(embeddings)
    for chunk in chunks:
        _metadata.append({"text": chunk, "source": source})


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
