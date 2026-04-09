"""
rag_pipeline.py — Retrieve context → build prompt → call LLM.
"""

import fitz  # PyMuPDF
from embeddings import encode_texts, encode_query
import vector_store as vs
import llm

CHUNK_SIZE    = 500   # characters
CHUNK_OVERLAP = 50
TOP_K         = 5

SYSTEM_PROMPT = (
    "You are a Smart Academic Assistant. Answer the student's question clearly "
    "and accurately using ONLY the provided context. If the context doesn't "
    "contain enough information, say so honestly.\n\n"
)


# ── PDF ingestion ────────────────────────────────────────────────────────────

def _extract_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    return "\n".join(page.get_text() for page in doc)


def _chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end].strip())
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c) > 50]   # drop tiny tail chunks


def ingest_pdf(pdf_path: str, source_name: str) -> int:
    """Parse PDF → chunk → embed → index. Returns chunk count."""
    text   = _extract_text(pdf_path)
    chunks = _chunk_text(text)
    embeds = encode_texts(chunks)
    vs.build_index(chunks, embeds, source_name)
    vs.save()
    return len(chunks)


# ── Query pipeline ───────────────────────────────────────────────────────────

def answer_question(question: str) -> dict:
    """
    Returns {"answer": str, "sources": [str], "context_used": bool}
    """
    q_emb   = encode_query(question)
    results = vs.search(q_emb, top_k=TOP_K)

    if results:
        context = "\n\n".join(
            f"[{r['source']}]\n{r['text']}" for r in results
        )
        sources = list({r["source"] for r in results})
        prompt  = (
            f"{SYSTEM_PROMPT}"
            f"Context:\n{context}\n\n"
            f"Question: {question}\n\nAnswer:"
        )
        context_used = True
    else:
        # No documents indexed — answer from LLM knowledge alone
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"No documents are available. Answer from general knowledge.\n\n"
            f"Question: {question}\n\nAnswer:"
        )
        sources, context_used = [], False

    answer = llm.generate(prompt)
    return {"answer": answer, "sources": sources, "context_used": context_used}
