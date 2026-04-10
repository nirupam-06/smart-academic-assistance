import numpy as np
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_model = None

def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model

def encode_texts(texts):
    model = _get_model()
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=False, normalize_embeddings=True)
    return np.array(embeddings, dtype=np.float32)

def encode_query(text):
    return encode_texts([text])