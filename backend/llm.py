"""
llm.py — LLM via Groq API (dynamic API key support)
"""

import requests

GROQ_MODEL = "llama-3.1-8b-instant"
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"


def generate(prompt: str, api_key: str) -> str:
    """Send prompt to Groq using user-provided API key."""

    # ❗ Check if key is provided
    if not api_key:
        return "Error: No API key provided."

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
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