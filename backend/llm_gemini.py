import requests

def generate(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}"

    data = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }

    try:
        res = requests.post(url, json=data)
        return res.json()["candidates"][0]["content"]["parts"][0]["text"]
    except:
        return "Gemini API Error"