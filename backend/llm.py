"""
llm.py — LLM via Groq API (fast, free, no GPU needed).
Set env var: GROQ_API_KEY=your_key_here
             GROQ_MODEL=llama-3.1-8b-instant  (default)
"""

import os, requests

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"


def generate(prompt: str) -> str:
    """Send prompt to Groq and return the answer."""
    if not GROQ_API_KEY:
        return "ERROR: GROQ_API_KEY not set. Run: set GROQ_API_KEY=your_key"

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 1024,
        "temperature": 0.7,
    }

    try:
        resp = requests.post(GROQ_URL, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except requests.exceptions.HTTPError as e:
        return f"Groq API error: {e.response.status_code} — {e.response.text}"
    except Exception as e:
        return f"Error calling Groq: {str(e)}"
