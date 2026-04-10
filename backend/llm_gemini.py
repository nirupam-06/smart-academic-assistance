import requests
import base64


# ── Gemini direct API ─────────────────────────────────────────────────────────

def generate(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    data = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 1024}
    }

    try:
        res = requests.post(url, json=data, timeout=30)
        result = res.json()

        # 🔥 DEBUG: print full response
        print("Gemini FULL response:", result)

        # ✅ SAFE parsing
        if "candidates" in result:
            return result["candidates"][0]["content"]["parts"][0]["text"]
        else:
            return f"Gemini API Error: {result}"

    except Exception as e:
        return f"Gemini API Exception: {e}"

def generate_with_image(prompt, image_base64, mime_type, api_key):
    """Send image + text to Gemini Vision (direct API key)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    data = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                {"text": prompt or "Describe this image in detail and answer any questions about it."}
            ]
        }],
        "generationConfig": {"maxOutputTokens": 1024}
    }

    try:
        res = requests.post(url, json=data, timeout=30)
        result = res.json()

        # 🔥 DEBUG
        print("Gemini Vision FULL response:", result)

        # ✅ SAFE parsing
        if "candidates" in result:
            return result["candidates"][0]["content"]["parts"][0]["text"]
        else:
            return f"Gemini Vision Error: {result}"

    except Exception as e:
        return f"Gemini Vision Exception: {e}"

# ── OpenRouter vision (google/gemini-flash-1.5 via OpenRouter key) ────────────

def generate_with_image_openrouter(prompt, image_base64, mime_type, api_key):
    """Send image + text to vision model via OpenRouter (no Gemini key needed)."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://smart-academic-assistance-production.up.railway.app",
    }
    data_url = f"data:{mime_type};base64,{image_base64}"
    body = {
        "model": "google/gemini-flash-1.5",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt or "Describe this image in detail and answer any questions about it."}
            ]
        }],
        "max_tokens": 1024,
    }
    try:
        res = requests.post(url, headers=headers, json=body, timeout=40)
        result = res.json()
        return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"OpenRouter Vision Error: {e}"


# ── Groq vision (llava model) ─────────────────────────────────────────────────

def generate_with_image_groq(prompt, image_base64, mime_type, api_key):
    """Send image + text to Groq's LLaVA vision model."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data_url = f"data:{mime_type};base64,{image_base64}"
    body = {
        "model": "llava-v1.5-7b-4096-preview",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt or "Describe this image in detail and answer any questions about it."}
            ]
        }],
        "max_tokens": 1024,
        "temperature": 0.7,
    }
    try:
        res = requests.post(url, headers=headers, json=body, timeout=40)
        result = res.json()
        return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Groq Vision Error: {e}"


# ── Smart picker — tries best available key ───────────────────────────────────

def generate_with_image_auto(prompt, image_base64, mime_type, keys: dict):
    """
    Try vision models in priority order based on which keys are available.
    Priority: Gemini (direct) -> OpenRouter -> Groq
    Returns (answer, model_used)
    """
    gemini_key     = (keys.get("gemini")     or "").strip()
    openrouter_key = (keys.get("openrouter") or "").strip()
    groq_key       = (keys.get("groq")       or "").strip()

    if gemini_key:
        answer = generate_with_image(prompt, image_base64, mime_type, gemini_key)
        if "Error" not in answer:
            return answer, "Gemini Vision"

    if openrouter_key:
        answer = generate_with_image_openrouter(prompt, image_base64, mime_type, openrouter_key)
        if "Error" not in answer:
            return answer, "OpenRouter (Gemini Flash)"

    if groq_key:
        answer = generate_with_image_groq(prompt, image_base64, mime_type, groq_key)
        if "Error" not in answer:
            return answer, "Groq (LLaVA)"

    return (
        "Image analysis requires at least one API key with vision support. "
        "Please add a Gemini, OpenRouter, or Groq key in the sidebar.",
        None
    )