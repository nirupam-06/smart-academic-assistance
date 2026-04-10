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
            result = llm.generate(prompt, api_key)
        elif model_name == "gemini":
            result = llm_gemini.generate(prompt, api_key)
        elif model_name == "deepseek":
            result = llm.generate_deepseek(prompt, api_key)
        elif model_name == "openrouter":
            result = llm.generate_openrouter(prompt, api_key)
        else:
            return model_name, None

        ERROR_PREFIXES = ("Gemini API Error", "Gemini API Exception",
                          "Groq error", "DeepSeek error", "OpenRouter error",
                          "Error:")
        if result and any(result.startswith(p) for p in ERROR_PREFIXES):
            print(f"{model_name} returned error, skipping: {result[:100]}")
            return model_name, None

        return model_name, result
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
    prompt  = f"{SYSTEM_PROMPT}Context:\n{context}\n\nQuestion: {question}"

    answers = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = [ex.submit(_call_model, m, k, prompt) for m,k in keys.items()]
        for f in as_completed(futures):
            m, a = f.result()
            if a:
                answers[m] = a

    final = list(answers.values())[0] if answers else "No response"
    return {"answer": final, "models": list(answers.keys())}

# ── QUIZ GENERATOR ─────────────────────────────────────────

def generate_quiz(source: str, user_keys: dict, num_questions: int = 10) -> dict:
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:10]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:10]

    if not chunks:
        return {"error": "No document found"}

    context = "\n\n".join(chunks)[:1000]

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

    chunks  = [m["text"] for m in vs._metadata][:8]
    context = "\n\n".join(chunks)[:1000]

    prompt = f"""You are a JSON generator. Return ONLY valid JSON, no explanation, no markdown, no extra text.

Create a mindmap from the context. Use this exact format:
{{"central":"main topic","branches":[{{"name":"branch name","children":["item1","item2","item3"]}}]}}

Context:
{context}

JSON only:"""

    import json, re
    for model_name, api_key in keys.items():
        try:
            if model_name == "groq":
                raw = llm.generate(prompt, api_key)
            elif model_name == "gemini":
                raw = llm_gemini.generate(prompt, api_key)
            else:
                raw = llm.generate(prompt, api_key)
            if not raw or any(raw.startswith(e) for e in ("Error", "Gemini API", "Groq error")):
                continue
            clean = re.sub(r"```json|```", "", raw).strip()
            match = re.search(r'\{.*\}', clean, re.DOTALL)
            if match:
                clean = match.group(0)
            return json.loads(clean)
        except Exception as e:
            print(f"Mindmap {model_name} error: {e}")
            continue
    return {"error": "Failed to generate mindmap. Please try again."}

# ── STUDY PLAN ─────────────────────────────────────────

def generate_study_plan(source, exam_date, hours, user_keys):
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys"}

    chunks  = [m["text"] for m in vs._metadata][:8]
    context = "\n\n".join(chunks)[:1000]

    prompt = f"""You are a JSON generator. Return ONLY valid JSON, no explanation, no markdown, no extra text.

Create a study plan for an exam on {exam_date} with {hours} hours per day.
Use this exact format:
{{"title":"Study Plan","exam_date":"{exam_date}","hours_per_day":{hours},"total_days":14,"days":[{{"day":1,"date":"YYYY-MM-DD","focus":"Topic Name","tasks":["task1","task2"],"goal":"What to achieve today","hours":{hours}}}]}}

Context:
{context}

JSON only:"""

    import json, re
    for model_name, api_key in keys.items():
        try:
            if model_name == "groq":
                raw = llm.generate(prompt, api_key)
            elif model_name == "gemini":
                raw = llm_gemini.generate(prompt, api_key)
            else:
                raw = llm.generate(prompt, api_key)
            if not raw or any(raw.startswith(e) for e in ("Error", "Gemini API", "Groq error")):
                continue
            clean = re.sub(r"```json|```", "", raw).strip()
            match = re.search(r'\{.*\}', clean, re.DOTALL)
            if match:
                clean = match.group(0)
            return json.loads(clean)
        except Exception as e:
            print(f"StudyPlan {model_name} error: {e}")
            continue
    return {"error": "Failed to generate study plan. Please try again."}