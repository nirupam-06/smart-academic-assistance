import hashlib
import numpy as np

DIM = 384

def _hash_embed(text: str) -> np.ndarray:
    vec = np.zeros(DIM, dtype=np.float32)
    words = text.lower().split()
    for i, word in enumerate(words):
        h = int(hashlib.md5(word.encode()).hexdigest(), 16)
        idx = h % DIM
        vec[idx] += 1.0 / (i + 1)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec

def encode_texts(texts: list) -> np.ndarray:
    return np.array([_hash_embed(t) for t in texts], dtype=np.float32)

def encode_query(text: str) -> np.ndarray:
    return encode_texts([text])