"""
rag_pipeline.py — RAG pipeline with multi-model support + 5 smart features:
  1. Memory across sessions
  2. Document comparison
  3. Auto quiz generator
  4. Mind map generator
  5. Study plan generator
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
    resolved = {}
    groq = user_keys.get("groq") or os.environ.get("GROQ_API_KEY", "")
    if groq: resolved["groq"] = groq
    gemini = user_keys.get("gemini") or os.environ.get("GEMINI_API_KEY", "")
    if gemini: resolved["gemini"] = gemini
    deepseek = user_keys.get("deepseek") or os.environ.get("DEEPSEEK_API_KEY", "")
    if deepseek: resolved["deepseek"] = deepseek
    openrouter = user_keys.get("openrouter") or os.environ.get("OPENROUTER_API_KEY", "")
    if openrouter: resolved["openrouter"] = openrouter
    return resolved

# ── Model callers ─────────────────────────────────────────────────────────────

def _call_model(model_name: str, api_key: str, prompt: str) -> tuple[str, str]:
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
        if answer and "error" not in answer.lower()[:20]:
            return model_name, answer
        return model_name, None
    except Exception as e:
        print(f"{model_name} error: {e}")
        return model_name, None

def _synthesize(question: str, answers: dict, judge_key: str) -> str:
    if len(answers) == 1:
        return list(answers.values())[0]
    answers_text = "\n\n".join(f"[{m.upper()}]:\n{a}" for m, a in answers.items())
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
    except:
        return max(answers.values(), key=len)

# ── Main query pipeline ───────────────────────────────────────────────────────

def answer_question(question: str, user_keys: dict, past_context: str = "") -> dict:
    q_emb   = encode_query(question)
    results = vs.search(q_emb, top_k=TOP_K)
    keys    = _resolve_keys(user_keys)

    if not keys:
        return {
            "answer": "No API keys available. Please add a Groq API key in the sidebar.",
            "sources": [], "context_used": False, "individual_answers": {}
        }

    memory_block = ""
    if past_context:
        memory_block = f"MEMORY — What this student has asked before:\n{past_context}\n\n"

    if results:
        context = "\n\n---\n\n".join(f"[Section from {r['source']}]:\n{r['text']}" for r in results)
        # Build rich source objects with chunk info
        seen = set()
        sources = []
        for r in results:
            key = f"{r['source']}#{r.get('chunk_index', 0)}"
            if key not in seen:
                seen.add(key)
                sources.append({
                    "file": r["source"],
                    "chunk": r.get("chunk_index", 0) + 1,
                    "preview": r["text"][:120].strip()
                })
        context_used = True
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"{memory_block}"
            f"Here are the most relevant sections from the document:\n\n"
            f"{context}\n\n"
            f"Student's question: {question}\n\n"
            f"Provide a detailed answer based on the sections above:"
        )
    else:
        sources = []
        context_used = False
        prompt = (
            f"{SYSTEM_PROMPT}"
            f"{memory_block}"
            f"No documents uploaded yet. Answer from your general academic knowledge.\n\n"
            f"Question: {question}\n\nAnswer:"
        )

    individual_answers = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(_call_model, model, key, prompt): model for model, key in keys.items()}
        for future in as_completed(futures):
            model_name, answer = future.result()
            if answer:
                individual_answers[model_name] = answer

    if not individual_answers:
        return {"answer": "All models failed to respond. Please check your API keys.",
                "sources": sources, "context_used": context_used, "individual_answers": {}}

    judge_key    = keys.get("groq") or list(keys.values())[0]
    final_answer = _synthesize(question, individual_answers, judge_key)

    return {
        "answer": final_answer, "sources": sources,
        "context_used": context_used, "individual_answers": individual_answers,
        "models_used": list(individual_answers.keys())
    }

# ── Feature 2: Document Comparison ───────────────────────────────────────────

def compare_documents(doc1: str, doc2: str, user_keys: dict) -> dict:
    """Compare two uploaded documents and return differences/similarities."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    # Get chunks from each document
    chunks1 = [m["text"] for m in vs._metadata if m["source"] == doc1][:6]
    chunks2 = [m["text"] for m in vs._metadata if m["source"] == doc2][:6]

    if not chunks1:
        return {"error": f"Document '{doc1}' not found. Please upload it first."}
    if not chunks2:
        return {"error": f"Document '{doc2}' not found. Please upload it first."}

    text1 = "\n\n".join(chunks1)
    text2 = "\n\n".join(chunks2)

    prompt = f"""You are an academic document analyst. Compare these two documents thoroughly.

DOCUMENT 1 ({doc1}):
{text1}

DOCUMENT 2 ({doc2}):
{text2}

Provide a structured comparison with:
1. **Main Topics** — What each document covers
2. **Key Similarities** — Common themes, concepts, or conclusions
3. **Key Differences** — Where they disagree or diverge
4. **Unique Insights** — What each document offers that the other doesn't
5. **Which to read first** — Recommendation with reasoning

Be specific and cite actual content from the documents."""

    judge_key = keys.get("groq") or list(keys.values())[0]
    try:
        answer = llm.generate(prompt, judge_key)
        return {"answer": answer, "doc1": doc1, "doc2": doc2}
    except Exception as e:
        return {"error": str(e)}

# ── Feature 3: Quiz Generator ─────────────────────────────────────────────────

def generate_quiz(source: str, user_keys: dict, num_questions: int = 10) -> dict:
    """Generate MCQ quiz from uploaded document."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:10]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:10]

    if not chunks:
        return {"error": "No document found. Please upload a PDF first."}

    context = "\n\n".join(chunks)
    prompt = f"""You are an academic quiz generator. Based on this document content, generate exactly {num_questions} multiple choice questions.

DOCUMENT CONTENT:
{context}

Generate {num_questions} MCQ questions in this EXACT JSON format (respond with JSON only, no extra text):
{{
  "title": "Quiz on [topic]",
  "questions": [
    {{
      "q": "Question text here?",
      "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
      "answer": "A",
      "explanation": "Brief explanation why A is correct"
    }}
  ]
}}

Rules:
- Questions must be based ONLY on the document content
- Make questions challenging but fair
- Each question must have exactly 4 options (A, B, C, D)
- Vary difficulty: mix easy, medium, and hard questions
- answer field must be just the letter: A, B, C, or D"""

    judge_key = keys.get("groq") or list(keys.values())[0]
    try:
        raw = llm.generate(prompt, judge_key)
        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()
        data = json.loads(clean)
        return data
    except Exception as e:
        return {"error": f"Quiz generation failed: {str(e)}"}

# ── Feature 4: Mind Map Generator ────────────────────────────────────────────

def generate_mindmap(source: str, user_keys: dict) -> dict:
    """Generate mind map data from document."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:8]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:8]

    if not chunks:
        return {"error": "No document found. Please upload a PDF first."}

    context = "\n\n".join(chunks)
    prompt = f"""You are an academic mind map generator. Analyze this document and create a structured mind map.

DOCUMENT:
{context}

Respond with ONLY valid JSON in this exact format:
{{
  "central": "Main Topic of Document",
  "branches": [
    {{
      "name": "Branch 1 Name",
      "color": "#e63946",
      "children": ["subtopic1", "subtopic2", "subtopic3"]
    }},
    {{
      "name": "Branch 2 Name", 
      "color": "#4285f4",
      "children": ["subtopic1", "subtopic2"]
    }},
    {{
      "name": "Branch 3 Name",
      "color": "#22c55e", 
      "children": ["subtopic1", "subtopic2", "subtopic3"]
    }},
    {{
      "name": "Branch 4 Name",
      "color": "#f59e0b",
      "children": ["subtopic1", "subtopic2"]
    }},
    {{
      "name": "Branch 5 Name",
      "color": "#a855f7",
      "children": ["subtopic1", "subtopic2", "subtopic3"]
    }}
  ]
}}

Rules:
- Central node = the main subject of the document
- 4-6 branches = major themes/sections
- 2-4 children per branch = key concepts
- Keep all text SHORT (max 4 words per node)
- Use the actual content from the document"""

    judge_key = keys.get("groq") or list(keys.values())[0]
    try:
        raw = llm.generate(prompt, judge_key)
        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()
        data = json.loads(clean)
        return data
    except Exception as e:
        return {"error": f"Mind map generation failed: {str(e)}"}

# ── Feature 5: Study Plan Generator ──────────────────────────────────────────

def generate_study_plan(source: str, exam_date: str, hours_per_day: int, user_keys: dict) -> dict:
    """Generate a day-by-day study plan based on document content."""
    keys = _resolve_keys(user_keys)
    if not keys:
        return {"error": "No API keys available"}

    if source == "all":
        chunks = [m["text"] for m in vs._metadata][:8]
    else:
        chunks = [m["text"] for m in vs._metadata if m["source"] == source][:8]

    if not chunks:
        return {"error": "No document found. Please upload a PDF first."}

    context = "\n\n".join(chunks)
    prompt = f"""You are an expert academic study planner. Create a detailed study plan.

DOCUMENT CONTENT:
{context}

EXAM DATE: {exam_date}
AVAILABLE HOURS PER DAY: {hours_per_day}

Generate a day-by-day study plan in this EXACT JSON format (JSON only, no extra text):
{{
  "title": "Study Plan for [topic]",
  "exam_date": "{exam_date}",
  "total_days": <number>,
  "hours_per_day": {hours_per_day},
  "days": [
    {{
      "day": 1,
      "date": "Day 1",
      "focus": "Topic to study",
      "tasks": ["Task 1", "Task 2", "Task 3"],
      "goal": "What you'll achieve today"
    }}
  ],
  "tips": ["Study tip 1", "Study tip 2", "Study tip 3"]
}}

Rules:
- Base ALL topics on the actual document content
- Space out topics logically — build from basics to advanced
- Last 2 days should be revision + practice
- Keep tasks specific and actionable
- Maximum 14 days in the plan"""

    judge_key = keys.get("groq") or list(keys.values())[0]
    try:
        raw = llm.generate(prompt, judge_key)
        import json, re
        clean = re.sub(r"```json|```", "", raw).strip()
        data = json.loads(clean)
        return data
    except Exception as e:
        return {"error": f"Study plan generation failed: {str(e)}"}