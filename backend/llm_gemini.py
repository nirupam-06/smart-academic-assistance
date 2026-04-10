import requests
import base64

def generate(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    data = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 1024}
    }
    try:
        res = requests.post(url, json=data, timeout=30)
        return res.json()["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return f"Gemini API Error: {e}"


def generate_with_image(prompt, image_base64, mime_type, api_key):
    """Send image + text to Gemini Vision and get answer."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    data = {
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": image_base64
                    }
                },
                {"text": prompt or "Describe this image in detail and answer any questions about it."}
            ]
        }],
        "generationConfig": {"maxOutputTokens": 1024}
    }
    try:
        res = requests.post(url, json=data, timeout=30)
        result = res.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return f"Gemini Vision Error: {e}"