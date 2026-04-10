"""
rag_pipeline.py — RAG pipeline with multi-model support + smart features
"""

import os
import fitz
from concurrent.futures import ThreadPoolExecutor, as_completed

from embeddings import encode_texts, encode_query
import vector_store as vs
import llm
import llm_gemini

CHUNK_SIZE    = 800
CHUNK_OVERLAP = 150
TOP_K         = 5

SYSTEM_PROMPT = (
    "You are a Smart Academic Assistant. Use only provided context. "
    "Be accurate and detailed.\n\n"
)

# ── PDF ingestion ─────────────────────────────────────────

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

# ── Key resolution ─────────────────────────────────────────

def _resolve_keys(user_keys: dict) -> dict:
    resolved = {}
    for key in ["groq", "gemini", "deepseek", "openrouter"]:
        val = user_keys.get(key) or os.environ.get(f"{key.upper()}_API_KEY", "")
        if val:
            resolved[key] = val
    return resolved

# ── Model calling ─────────────────────────────────────────

def _call_model(model_name, api_key, prompt):
    try:
        if model_name == "groq":
            return model_name, llm.generate(prompt, api_key)
        elif model_name == "gemini":
            return model_name, llm_gemini.generate(prompt, api_key)
        elif model_name == "deepseek":
            return model_name, llm.generate_deepseek(prompt, api_key)
        elif model_name == "openrouter":
            return model_name, llm.generate_openrouter(prompt, api_key)
    except Exception as e:
        print(f"{model_name} error:", e)
    return model_name, None

# ── MAIN QA ─────────────────────────────────────────

def answer_question(question, user_keys):
    q_emb   = encode_query(question)
    results = vs.search(q_emb, top_k=TOP_K)
    keys    = _resolve_keys(user_keys)

    if not keys:
        return {"answer": "No API key provided"}

    context = "\n\n".join(r["text"] for r in results)[:1500]

    prompt = f"{SYSTEM_PROMPT}Context:\n{context}\n\nQuestion: {question}"

    answers = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(_call_model, m, k, prompt) for m,k in keys.items()]
        for f in as_completed(futures):
            m,a = f.result()
            if a:
                answers[m] = a

    final = list(answers.values())[0] if answers else "No response"
    return {"answer": final, "models": list(answers.keys())}

# ── QUIZ GENERATOR (FIXED) ─────────────────────────────────────────

def generate_quiz(source: str, user_keys: dict, num_questions: int = 10) -> dict:
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    # get chunks
    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:10]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:10]

    if not chunks:
        return {"error": "No document found"}

    # ✅ LIMIT CONTEXT
    context = "\n\n".join(chunks)[:1000]

    # ✅ CLEAN PROMPT
    prompt = f"""
Generate {num_questions} MCQ questions.

Return STRICT JSON ONLY:

[
  {{
    "question": "string",
    "options": ["A","B","C","D"],
    "answer": "A"
  }}
]

Context:
{context}
"""

    judge_key = list(keys.values())[0]

    try:
        raw = llm.generate(prompt, judge_key)

        print("LLM RAW:", raw)

        if not raw:
            return {"error": "Empty response"}

        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()

        try:
            data = json.loads(clean)
        except:
            return {"error": "Invalid JSON from AI"}

        return {"questions": data}

    except Exception as e:
        return {"error": str(e)}

# ── MINDMAP ─────────────────────────────────────────

def generate_mindmap(source, user_keys):
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks = [m["text"] for m in vs._metadata][:8]
    context = "\n\n".join(chunks)[:1000]

    prompt = f"""
Create mindmap JSON:

{{
 "central":"topic",
 "branches":[{{"name":"branch","children":["a","b"]}}]
}}

Context:
{context}
"""

    try:
        raw = llm.generate(prompt, list(keys.values())[0])
        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()
        return json.loads(clean)
    except Exception as e:
        return {"error": str(e)}

# ── STUDY PLAN ─────────────────────────────────────────

def generate_study_plan(source, exam_date, hours, user_keys):
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks = [m["text"] for m in vs._metadata][:8]
    context = "\n\n".join(chunks)[:1000]

    prompt = f"""
Create study plan JSON.

Exam: {exam_date}
Hours/day: {hours}

Context:
{context}
"""

    try:
        raw = llm.generate(prompt, list(keys.values())[0])
        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()
        return json.loads(clean)
    except Exception as e:
        return {"error": str(e)}