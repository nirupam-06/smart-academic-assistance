"""
embeddings.py — Embeddings using a simple TF-IDF style approach.
No torch, no sentence-transformers, no GPU needed.
Works on any laptop instantly.
"""

import re
import math
from collections import Counter


def _tokenize(text: str) -> list:
    return re.findall(r'\b\w+\b', text.lower())


def _build_vocab(texts: list) -> dict:
    vocab = {}
    idx = 0
    for text in texts:
        for word in _tokenize(text):
            if word not in vocab:
                vocab[word] = idx
                idx += 1
    return vocab


def _tfidf_vector(text: str, vocab: dict, idf: dict) -> list:
    tokens = _tokenize(text)
    tf = Counter(tokens)
    total = len(tokens) or 1
    vec = [0.0] * len(vocab)
    for word, count in tf.items():
        if word in vocab:
            vec[vocab[word]] = (count / total) * idf.get(word, 1.0)
    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


# Global vocab + idf state (built during encode_texts)
_vocab = {}
_idf   = {}
_dim   = 512  # fixed output dimension via hashing trick


def _hash_vector(text: str, dim: int = 512) -> list:
    """Fast hash-based embedding — no dependencies needed."""
    tokens = _tokenize(text)
    vec = [0.0] * dim
    for word in tokens:
        h = hash(word) % dim
        vec[h] += 1.0
    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def encode_texts(texts: list) -> list:
    """Encode a list of strings → list of float vectors."""
    return [_hash_vector(t, _dim) for t in texts]


def encode_query(query: str) -> list:
    """Encode a single query string → float vector."""
    return _hash_vector(query, _dim)
