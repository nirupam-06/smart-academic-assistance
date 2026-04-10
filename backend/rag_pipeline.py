"""
rag_pipeline.py — RAG pipeline with multi-model support + majority vote synthesis.

Flow:
  1. Retrieve top-3 chunks from FAISS (better precision than top-15)
  2. Build prompt with context
  3. Query ALL available models in parallel
  4. If 1 model → return directly
  5. If multiple → majority vote synthesis via Groq judge
"""

import os
import fitz  # PyMuPDF
from concurrent.futures import ThreadPoolExecutor, as_completed

from embeddings import encode_texts, encode_query
import vector_store as vs
import llm
import llm_gemini

# ── Config ────────────────────────────────────────────────────────────────────

CHUNK_SIZE    = 800
CHUNK_OVERLAP = 150
TOP_K         = 8  # top 3 chunks — precise, avoids token overflow

SYSTEM_PROMPT = (
    "You are a Smart Academic Assistant. You have been given excerpts from a document. "
    "Answer the student's question using the provided context. "
    "Base your answer STRICTLY on the context provided — do not make things up. "
    "If the answer is spread across multiple sections, combine them into a coherent response. "
    "Be detailed and thorough in your answer.\n\n"
)

# ── PDF ingestion ─────────────────────────────────────────────────────────────

def _extract_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    return "\n".join(page.get_text() for page in doc)


def _chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end].strip())
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c) > 50]


def ingest_pdf(pdf_path: str, source_name: str) -> int:
    text   = _extract_text(pdf_path)
    chunks = _chunk_text(text)
    embeds = encode_texts(chunks)
    vs.build_index(chunks, embeds, source_name)
    vs.save()
    return len(chunks)


# ── Key resolution ────────────────────────────────────────────────────────────

def _resolve_keys(user_keys: dict) -> dict:
    """
    Merge user-provided keys with backend defaults.
    User key takes priority. Falls back to env var.
    Returns only non-empty keys.
    """
    resolved = {}

    groq = user_keys.get("groq") or os.environ.get("GROQ_API_KEY", "")
    if groq:
        resolved["groq"] = groq

    gemini = user_keys.get("gemini") or os.environ.get("GEMINI_API_KEY", "")
    if gemini:
        resolved["gemini"] = gemini

    deepseek = user_keys.get("deepseek") or os.environ.get("DEEPSEEK_API_KEY", "")
    if deepseek:
        resolved["deepseek"] = deepseek

    openrouter = user_keys.get("openrouter") or os.environ.get("OPENROUTER_API_KEY", "")
    if openrouter:
        resolved["openrouter"] = openrouter

    return resolved


# ── Model callers ─────────────────────────────────────────────────────────────

def _call_model(model_name: str, api_key: str, prompt: str) -> tuple[str, str]:
    """Call a single model. Returns (model_name, answer)."""
    try:
        if model_name == "groq":
            answer = llm.generate(prompt, api_key)
        elif model_name == "gemini":
            answer = llm_gemini.generate(prompt, api_key)
        elif model_name == "deepseek":
            answer = llm.generate_deepseek(prompt, api_key)
        elif model_name == "openrouter":
            answer = llm.generate_openrouter(prompt, api_key)
        else:
            answer = "Unknown model"

        # Filter out error responses
        if answer and "error" not in answer.lower()[:20]:
            return model_name, answer
        return model_name, None

    except Exception as e:
        print(f"{model_name} error: {e}")
        return model_name, None


# ── Majority vote synthesis ───────────────────────────────────────────────────

def _synthesize(question: str, answers: dict, judge_key: str) -> str:
    """
    Given multiple model answers, use Groq as judge to:
    - Find common correct points (majority vote)
    - Merge into one clean final answer
    - Remove contradictions
    """
    if len(answers) == 1:
        return list(answers.values())[0]

    answers_text = "\n\n".join(
        f"[{model.upper()}]:\n{answer}"
        for model, answer in answers.items()
    )

    synthesis_prompt = f"""You are a judge AI that synthesizes answers from multiple AI models.

Question asked: {question}

Answers from different AI models:
{answers_text}

Your task:
- Identify points that MULTIPLE models agree on (majority vote = more reliable)
- Combine the best explanations from each model
- Remove any contradictions — prefer the majority view
- Give ONE clean, structured, accurate final answer
- Do NOT mention which model said what
- Be concise but complete

Final synthesized answer:"""

    try:
        return llm.generate(synthesis_prompt, judge_key)
    except Exception as e:
        # fallback: return the longest answer (likely most detailed)
        return max(answers.values(), key=len)


# ── Main query pipeline ───────────────────────────────────────────────────────

def answer_question(question: str, user_keys: dict) -> dict:
    """
    Full RAG pipeline:
    1. Retrieve top-3 chunks
    2. Build context prompt
    3. Query all available models in parallel
    4. Synthesize via majority vote
    """

    # Step 1: Retrieve relevant chunks
    q_emb   = encode_query(question)
    results = vs.search(q_emb, top_k=TOP_K)

    # Step 2: Resolve all available API keys
    keys = _resolve_keys(user_keys)

    if not keys:
        return {
            "answer": "No API keys available. Please add a Groq API key in the sidebar or contact the admin.",
            "sources": [],
            "context_used": False,
            "individual_answers": {}
        }

    # Step 3: Build RAG prompt
    if results:
        context = "\n\n---\n\n".join(
            f"[Section from {r['source']}]:\n{r['text']}" for r in results
        )
        sources      = list({r["source"] for r in results})
        context_used = True
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"Here are the most relevant sections from the document:\n\n"
            f"{context}\n\n"
            f"Student's question: {question}\n\n"
            f"Provide a detailed answer based on the sections above:"
        )
    else:
        sources      = []
        context_used = False
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"No documents uploaded yet. Answer from your general academic knowledge.\n\n"
            f"Question: {question}\n\nAnswer:"
        )

    # Step 4: Query all models in parallel
    individual_answers = {}

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(_call_model, model, key, prompt): model
            for model, key in keys.items()
        }
        for future in as_completed(futures):
            model_name, answer = future.result()
            if answer:
                individual_answers[model_name] = answer

    if not individual_answers:
        return {
            "answer": "All models failed to respond. Please check your API keys.",
            "sources": sources,
            "context_used": context_used,
            "individual_answers": {}
        }

    # Step 5: Synthesize via majority vote (uses Groq as judge)
    judge_key = keys.get("groq") or list(keys.values())[0]
    final_answer = _synthesize(question, individual_answers, judge_key)

    return {
        "answer": final_answer,
        "sources": sources,
        "context_used": context_used,
        "individual_answers": individual_answers,
        "models_used": list(individual_answers.keys())
    }