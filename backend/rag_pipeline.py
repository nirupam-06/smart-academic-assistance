"""
rag_pipeline.py — RAG pipeline with BGE-Small semantic embeddings.

Changes from hash-embedding version
────────────────────────────────────
1. Chunk size raised from 800 → 1000 chars.
   BGE-Small handles 512 tokens (~2000 chars). Using 1000 chars gives
   richer context per chunk while staying well within the token window.

2. Chunk overlap raised from 150 → 200 chars.
   Larger overlap preserves sentence/paragraph continuity at boundaries,
   which matters more now that the model actually understands semantics.

3. Sentence-boundary chunking added (_chunk_text_smart).
   The old hard-cutoff splitter slices mid-sentence. BGE embeds whole
   sentences far better than truncated fragments. The smart splitter
   walks forward to the next sentence end ('. ', '! ', '? ', '\n')
   before cutting, keeping chunks as complete-sentence units.

4. encode_query() is called as-is — the BGE prefix is now internal to
   embeddings.py. No call-site changes needed.

5. Retrieval now uses the score field returned by vector_store.search()
   to apply a minimum cosine-similarity threshold (SCORE_THRESHOLD = 0.25).
   Low-scoring results are excluded from context to reduce hallucination.

6. TOP_K raised from 5 → 7. With semantic embeddings, more candidates
   are trustworthy. We still only pass the top 3 to the LLM prompt (the
   rest are returned as 'sources' metadata for the frontend).
"""

from __future__ import annotations

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import fitz  # PyMuPDF

from embeddings import encode_texts, encode_query, warm_up
import vector_store as vs
import llm
import llm_gemini

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

CHUNK_SIZE      = int(os.environ.get("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP   = int(os.environ.get("CHUNK_OVERLAP", "200"))
TOP_K           = int(os.environ.get("TOP_K", "7"))
CONTEXT_CHUNKS  = int(os.environ.get("CONTEXT_CHUNKS", "3"))  # chunks sent to LLM
SCORE_THRESHOLD = float(os.environ.get("SCORE_THRESHOLD", "0.25"))  # min cosine sim

SYSTEM_PROMPT = (
    "You are a Smart Academic Assistant. Answer the question using ONLY the "
    "provided context. If the context does not contain enough information to "
    "answer, say so clearly. Be accurate, concise, and detailed.\n\n"
)


# ── PDF ingestion ─────────────────────────────────────────────────────────────

def _extract_text(pdf_path: str) -> str:
    """Extract all text from a PDF, preserving page breaks as newlines."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text("text")  # plain text, not blocks
        if text.strip():
            pages.append(text.strip())
    return "\n\n".join(pages)


def _chunk_text(text: str) -> list[str]:
    """
    Sentence-boundary-aware chunker.

    Splits text into chunks of approximately CHUNK_SIZE characters,
    snapping the cut to the nearest sentence boundary within a 100-char
    lookahead window. This produces cleaner embeddings because BGE-Small
    encodes whole propositions better than truncated fragments.

    Overlap of CHUNK_OVERLAP chars ensures continuity across boundaries.
    """
    sentence_endings = re.compile(r'(?<=[.!?])\s+')
    chunks: list[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + CHUNK_SIZE, text_len)

        # Snap to nearest sentence boundary within 100-char lookahead
        if end < text_len:
            lookahead = text[end : end + 100]
            match = sentence_endings.search(lookahead)
            if match:
                end = end + match.start() + 1  # include the trailing space

        chunk = text[start:end].strip()
        if len(chunk) > 50:  # discard micro-chunks (headers, page numbers)
            chunks.append(chunk)

        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def ingest_pdf(pdf_path: str, source_name: str) -> int:
    """
    Full ingestion pipeline for a single PDF.

    1. Extract text with PyMuPDF
    2. Split into sentence-aligned chunks
    3. Encode chunks with BGE-Small (batch mode)
    4. Upsert into FAISS (replaces stale chunks for this source)
    5. Persist to disk

    Returns the number of chunks indexed.
    """
    logger.info("Ingesting PDF: %s", source_name)
    text   = _extract_text(pdf_path)
    chunks = _chunk_text(text)
    logger.info("Extracted %d chunks from %s", len(chunks), source_name)

    embeds = encode_texts(chunks)
    vs.build_index(chunks, embeds, source_name)
    vs.save()

    logger.info("Indexed %d chunks for %s", len(chunks), source_name)
    return len(chunks)


# ── Key resolution ────────────────────────────────────────────────────────────

def _resolve_keys(user_keys: dict) -> dict:
    """Merge user-supplied keys with env var fallbacks."""
    resolved = {}
    for key in ("groq", "gemini", "deepseek", "openrouter"):
        val = (user_keys or {}).get(key) or os.environ.get(f"{key.upper()}_API_KEY", "")
        if val and val.strip():
            resolved[key] = val.strip()
    return resolved


# ── LLM dispatch ─────────────────────────────────────────────────────────────

_ERROR_PREFIXES = (
    "Gemini API Error", "Gemini API Exception",
    "Groq error", "DeepSeek error", "OpenRouter error",
    "Error:",
)


def _call_model(model_name: str, api_key: str, prompt: str) -> tuple[str, str | None]:
    """
    Call a single LLM. Returns (model_name, answer_or_None).
    Never raises — errors are swallowed and logged.
    """
    try:
        if model_name == "groq":
            result = llm.generate(prompt, api_key)
        elif model_name == "gemini":
            result = llm_gemini.generate(prompt, api_key)
        elif model_name == "deepseek":
            result = llm.generate_deepseek(prompt, api_key)
        elif model_name == "openrouter":
            result = llm.generate_openrouter(prompt, api_key)
        else:
            return model_name, None

        if not result or not isinstance(result, str):
            return model_name, None
        if any(result.startswith(p) for p in _ERROR_PREFIXES):
            logger.warning("%s returned an error response: %s", model_name, result[:80])
            return model_name, None

        return model_name, result

    except Exception as exc:
        logger.error("%s call failed: %s", model_name, exc)
        return model_name, None


# ── Main Q&A ──────────────────────────────────────────────────────────────────

def answer_question(question: str, user_keys: dict) -> dict:
    """
    Full RAG query pipeline.

    1. Embed the question with BGE-Small (+ query prefix)
    2. Retrieve top-K chunks from FAISS, filter by cosine-sim threshold
    3. Build context string from top CONTEXT_CHUNKS results
    4. Fire all available LLMs in parallel with ThreadPoolExecutor
    5. Pick the longest non-error response as the final answer

    Returns
    -------
    {
        answer:              str,
        models:              list[str],           # which models responded
        sources:             list[str],           # PDF filenames used
        context_used:        bool,
        individual_answers:  dict[str, str],      # per-model answers
        retrieval_scores:    list[float],         # cosine sim of top chunks
    }
    """
    if not vs._metadata:
        return {"answer": "⚠️ Please upload a PDF first before asking questions."}

    # 1. Semantic retrieval
    q_emb   = encode_query(question)
    results = vs.search(q_emb, top_k=TOP_K)

    # 2. Quality filter — drop chunks below cosine similarity threshold
    good_results = [r for r in results if r.get("score", 0.0) >= SCORE_THRESHOLD]
    if not good_results:
        # Threshold too aggressive — fall back to top-1 to avoid empty context
        good_results = results[:1] if results else []
        logger.warning(
            "All %d retrieved chunks scored below %.2f. Using top-1 fallback.",
            len(results), SCORE_THRESHOLD
        )

    keys = _resolve_keys(user_keys)
    if not keys:
        return {"answer": "No API key provided. Please add at least one API key in the sidebar."}

    # 3. Build context from best chunks
    context_chunks = good_results[:CONTEXT_CHUNKS]
    context = "\n\n---\n\n".join(r["text"] for r in context_chunks)
    prompt  = f"{SYSTEM_PROMPT}Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"

    # 4. Parallel LLM calls
    answers: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(_call_model, m, k, prompt): m for m, k in keys.items()}
        for future in as_completed(futures):
            model_name, answer = future.result()
            if not answer:
                continue
            if len(answer.strip()) < 30:
                continue
            if "error" in answer.lower()[:50]:
                continue
            answers[model_name] = answer

    final = max(answers.values(), key=len) if answers else "No response from any model."

    return {
        "answer":             final,
        "models":             list(answers.keys()),
        "sources":            list({r["source"] for r in good_results}),
        "context_used":       bool(good_results),
        "individual_answers": answers,
        "retrieval_scores":   [round(r.get("score", 0.0), 4) for r in context_chunks],
    }


# ── Quiz generator ────────────────────────────────────────────────────────────

def generate_quiz(source: str, user_keys: dict, num_questions: int = 10) -> dict:
    """Generate MCQ quiz questions from indexed document chunks."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:10]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:10]

    if not chunks:
        return {"error": "No document found. Please upload a PDF first."}

    context = "\n\n".join(chunks)[:1200]

    prompt = (
        f"You are a JSON generator. Return ONLY a JSON array, no explanation, "
        f"no markdown, no extra text.\n\n"
        f"Generate {num_questions} MCQ questions from the context.\n\n"
        f"Use this exact format:\n"
        f'[{{"question":"string","options":["A. option","B. option","C. option","D. option"],"answer":"A"}}]\n\n'
        f"Context:\n{context}\n\nJSON array only:"
    )

    def _try_parse_quiz(raw: str | None) -> list | None:
        if not raw:
            return None
        clean = re.sub(r"```json|```", "", raw).strip()
        match = re.search(r"\[.*\]", clean, re.DOTALL)
        if match:
            clean = match.group(0)
        clean = re.sub(r",\s*([\]\}])", r"\1", clean)
        try:
            return json.loads(clean)
        except Exception:
            return None

    for model_name, api_key in keys.items():
        try:
            raw = _dispatch_single(model_name, api_key, prompt)
            data = _try_parse_quiz(raw)
            if data and isinstance(data, list) and len(data) > 0:
                return {"questions": data}
        except Exception as exc:
            logger.warning("Quiz generation failed for %s: %s", model_name, exc)

    return {"error": "Could not generate valid quiz. Try again or upload a different PDF."}


# ── Mind map ──────────────────────────────────────────────────────────────────

def generate_mindmap(source: str, user_keys: dict) -> dict:
    """Generate a mind map JSON structure from indexed document chunks."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks = [m["text"] for m in vs._metadata][:8]
    if not chunks:
        return {"error": "No document found. Please upload a PDF first."}

    context = "\n\n".join(chunks)[:1200]
    prompt = (
        f"You are a JSON generator. Return ONLY valid JSON, no explanation, "
        f"no markdown, no extra text.\n\n"
        f"Create a mindmap from the context. Use this exact format:\n"
        f'{{"central":"main topic","branches":[{{"name":"branch name","children":["item1","item2","item3"]}}]}}\n\n'
        f"Context:\n{context}\n\nJSON only:"
    )

    for model_name, api_key in keys.items():
        try:
            raw = _dispatch_single(model_name, api_key, prompt)
            if not raw or any(raw.startswith(e) for e in _ERROR_PREFIXES):
                continue
            clean = re.sub(r"```json|```", "", raw).strip()
            match = re.search(r"\{.*\}", clean, re.DOTALL)
            if match:
                clean = match.group(0)
            data = json.loads(clean)
            if "central" in data and "branches" in data:
                return data
        except Exception as exc:
            logger.warning("Mindmap generation failed for %s: %s", model_name, exc)

    return {"error": "Failed to generate mindmap. Please try again."}


# ── Study plan ────────────────────────────────────────────────────────────────

def generate_study_plan(source: str, exam_date: str, hours: int, user_keys: dict) -> dict:
    """Generate a day-by-day study plan from document context."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks  = [m["text"] for m in vs._metadata][:8]
    context = "\n\n".join(chunks)[:1200]

    prompt = (
        f"You are a JSON generator. Return ONLY valid JSON, no explanation, no markdown, no extra text.\n\n"
        f"Create a study plan for an exam on {exam_date} with {hours} hours per day.\n"
        f"Use this exact format:\n"
        f'{{"title":"Study Plan","exam_date":"{exam_date}","hours_per_day":{hours},"total_days":14,'
        f'"days":[{{"day":1,"date":"YYYY-MM-DD","focus":"Topic Name","tasks":["task1","task2"],'
        f'"goal":"What to achieve today","hours":{hours}}}]}}\n\n'
        f"Context:\n{context}\n\nJSON only:"
    )

    for model_name, api_key in keys.items():
        try:
            raw = _dispatch_single(model_name, api_key, prompt)
            if not raw or any(raw.startswith(e) for e in _ERROR_PREFIXES):
                continue
            clean = re.sub(r"```json|```", "", raw).strip()
            match = re.search(r"\{.*\}", clean, re.DOTALL)
            if match:
                clean = match.group(0)
            return json.loads(clean)
        except Exception as exc:
            logger.warning("Study plan generation failed for %s: %s", model_name, exc)

    return {"error": "Failed to generate study plan. Please try again."}


# ── Document comparison ───────────────────────────────────────────────────────

def compare_documents(doc1: str, doc2: str, user_keys: dict) -> dict:
    """Compare two indexed documents semantically."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks1 = [m["text"] for m in vs._metadata if m["source"] == doc1][:5]
    chunks2 = [m["text"] for m in vs._metadata if m["source"] == doc2][:5]

    if not chunks1:
        return {"error": f"Document '{doc1}' not found. Please upload it first."}
    if not chunks2:
        return {"error": f"Document '{doc2}' not found. Please upload it first."}

    context1 = "\n\n".join(chunks1)[:1000]
    context2 = "\n\n".join(chunks2)[:1000]

    prompt = (
        f"Compare these two documents and give a detailed comparison covering:\n"
        f"1. Main topics covered\n"
        f"2. Key differences\n"
        f"3. Key similarities\n"
        f"4. Which is more comprehensive and why\n\n"
        f"Document 1 ({doc1}):\n{context1}\n\n"
        f"Document 2 ({doc2}):\n{context2}\n\nComparison:"
    )

    for model_name, api_key in keys.items():
        try:
            raw = _dispatch_single(model_name, api_key, prompt)
            if raw and not any(raw.startswith(e) for e in _ERROR_PREFIXES):
                return {"answer": raw}
        except Exception as exc:
            logger.warning("Document comparison failed for %s: %s", model_name, exc)

    return {"error": "Failed to compare documents. Please try again."}


# ── Internal dispatch helper ──────────────────────────────────────────────────

def _dispatch_single(model_name: str, api_key: str, prompt: str) -> str | None:
    """Route a prompt to the correct LLM caller. Returns raw string or None."""
    if model_name == "groq":
        return llm.generate(prompt, api_key)
    if model_name == "gemini":
        return llm_gemini.generate(prompt, api_key)
    if model_name == "deepseek":
        return llm.generate_deepseek(prompt, api_key)
    if model_name == "openrouter":
        return llm.generate_openrouter(prompt, api_key)
    return None
