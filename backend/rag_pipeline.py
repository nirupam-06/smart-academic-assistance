"""
rag_pipeline.py — Retrieve context → build prompt → call LLM.
"""

import fitz  # PyMuPDF
from embeddings import encode_texts, encode_query
import vector_store as vs
import llm

CHUNK_SIZE    = 800   # increased from 500 for more context per chunk
CHUNK_OVERLAP = 150   # increased overlap so context isn't lost at boundaries
TOP_K         = 15    # increased from 5 to retrieve more relevant chunks

SYSTEM_PROMPT = (
    "You are a Smart Academic Assistant. You have been given excerpts from a document. "
    "Answer the student's question using the provided context. "
    "Base your answer STRICTLY on the context provided — do not make things up. "
    "If the answer is spread across multiple sections, combine them into a coherent response. "
    "Be detailed and thorough in your answer.\n\n"
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
        context = "\n\n---\n\n".join(
            f"[Section from {r['source']}]:\n{r['text']}" for r in results
        )
        sources = list({r["source"] for r in results})
        prompt  = (
            f"{SYSTEM_PROMPT}"
            f"Here are the relevant sections from the document:\n\n"
            f"{context}\n\n"
            f"Student's question: {question}\n\n"
            f"Provide a detailed answer based on the sections above:"
        )
        context_used = True
    else:
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"No documents are available. Answer from general knowledge.\n\n"
            f"Question: {question}\n\nAnswer:"
        )
        sources, context_used = [], False

    answer = llm.generate(prompt)
    return {"answer": answer, "sources": sources, "context_used": context_used}
