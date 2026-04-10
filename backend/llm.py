"""
llm.py — Multi-model LLM callers (Groq, DeepSeek, OpenRouter)
"""

import requests

# ── Groq ──────────────────────────────────────────────────────────────────────

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

def generate(prompt: str, api_key: str) -> str:
    if not api_key:
        return "Error: No Groq API key"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body    = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.7,
    }
    try:
        resp = requests.post(GROQ_URL, headers=headers, json=body, timeout=30)
        if resp.status_code == 429:
            raise Exception("rate_limit_429")
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Groq error: {str(e)}"


# ── DeepSeek ──────────────────────────────────────────────────────────────────

DEEPSEEK_URL   = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

def generate_deepseek(prompt: str, api_key: str) -> str:
    if not api_key:
        return "Error: No DeepSeek API key"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body    = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.7,
    }
    try:
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"DeepSeek error: {str(e)}"


# ── OpenRouter ────────────────────────────────────────────────────────────────

OPENROUTER_URL   = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "mistralai/mistral-7b-instruct"

def generate_openrouter(prompt: str, api_key: str) -> str:
    if not api_key:
        return "Error: No OpenRouter API key"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://smart-academic-assistance-production.up.railway.app",
    }
    body = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
    }
    try:
        resp = requests.post(OPENROUTER_URL, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"OpenRouter error: {str(e)}"