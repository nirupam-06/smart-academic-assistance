// js/ai-sidebar.js — Multi-AI model integration (fixed)

const MODELS = {
  groq: { name: "Groq (Llama 3)", icon: "⚡", color: "#f97316", call: callGroq },
  gemini: { name: "Google Gemini", icon: "✨", color: "#4285f4", call: callGemini },
  deepseek: { name: "DeepSeek", icon: "🧠", color: "#6366f1", call: callDeepSeek },
  openrouter: { name: "OpenRouter", icon: "🌐", color: "#10b981", call: callOpenRouter }
};

function openSidebar() {
  document.getElementById("ai-sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("show");
  loadSavedKeys();
}

function closeSidebar() {
  document.getElementById("ai-sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

async function saveKey(model) {
  const inputEl = document.getElementById(`key-${model}`);
  const val = inputEl ? inputEl.value.trim() : "";
  const btn = document.getElementById(`save-btn-${model}`);

  if (!val) {
    showKeyMessage(model, "⚠️ Please enter your API key", "warn");
    return;
  }

  if (btn) { btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i>"; btn.disabled = true; }

  try {
    await validateKey(model, val);
    localStorage.setItem(`key-${model}`, val);
    localStorage.setItem(`ai_enabled_${model}`, "true");
    const toggle = document.getElementById(`toggle-${model}`);
    const card   = document.getElementById(`card-${model}`);
    if (toggle) toggle.checked = true;
    if (card)   card.classList.add("active");
    showKeyMessage(model, `✅ ${MODELS[model]?.name || model} key accepted!`, "success");
  } catch (err) {
    showKeyMessage(model, `❌ Invalid key — please check and try again`, "error");
  } finally {
    if (btn) { btn.innerHTML = "<i class='fas fa-check'></i>"; btn.disabled = false; }
  }
}

function loadSavedKeys() {
  ["groq", "gemini", "deepseek", "openrouter"].forEach(model => {
    const saved = localStorage.getItem(`key-${model}`);
    if (saved) {
      const inputEl = document.getElementById(`key-${model}`);
      if (inputEl) inputEl.value = saved;
    }
    if (model === "groq") {
      const toggle = document.getElementById("toggle-groq");
      const card   = document.getElementById("card-groq");
      if (toggle) toggle.checked = true;
      if (card)   card.classList.add("active");
    } else {
      const enabled = localStorage.getItem(`ai_enabled_${model}`);
      if (enabled === "true") {
        const toggle = document.getElementById(`toggle-${model}`);
        const card   = document.getElementById(`card-${model}`);
        if (toggle) toggle.checked = true;
        if (card)   card.classList.add("active");
      }
    }
  });
}

async function toggleModel(model) {
  const toggle = document.getElementById(`toggle-${model}`);
  const checked = toggle.checked;
  const card = document.getElementById(`card-${model}`);

  if (!checked) {
    // Turning OFF — just disable
    localStorage.setItem(`ai_enabled_${model}`, "false");
    if (card) card.classList.remove("active");
    return;
  }

  // Turning ON — read key from input field
  const inputEl = document.getElementById(`key-${model}`);
  const val = inputEl ? inputEl.value.trim() : "";

  if (!val) {
    // No key entered — revert toggle and warn
    toggle.checked = false;
    showKeyMessage(model, "⚠️ Please enter your API key below first", "warn");
    return;
  }

  // Show spinner on toggle
  toggle.disabled = true;
  showKeyMessage(model, "⏳ Validating key...", "warn");

  try {
    await validateKey(model, val);
    localStorage.setItem(`key-${model}`, val);
    localStorage.setItem(`ai_enabled_${model}`, "true");
    if (card) card.classList.add("active");
    showKeyMessage(model, `✅ ${MODELS[model]?.name || model} connected!`, "success");
  } catch (err) {
    toggle.checked = false;
    localStorage.setItem(`ai_enabled_${model}`, "false");
    if (card) card.classList.remove("active");
    showKeyMessage(model, `❌ Invalid key — please check and try again`, "error");
  } finally {
    toggle.disabled = false;
  }
}

function getActiveModels() {
  return ["groq", "gemini", "deepseek", "openrouter"].filter(m => {
    const toggle = document.getElementById(`toggle-${m}`);
    return toggle && toggle.checked;
  });
}

function getKey(model) {
  return document.getElementById(`key-${model}`)?.value.trim() ||
    localStorage.getItem(`key-${model}`) || "";
}

function showKeyMessage(model, text, type) {
  const el = document.getElementById(`msg-${model}`);
  if (!el) return;
  const colors = {
    success: { bg: "#0d2e1a", color: "#22c55e", border: "#166534" },
    error:   { bg: "#2e0d0d", color: "#ef4444", border: "#7f1d1d" },
    warn:    { bg: "#2e2000", color: "#f59e0b", border: "#78350f" },
  };
  const c = colors[type] || colors.warn;
  el.style.background = c.bg;
  el.style.color      = c.color;
  el.style.border     = `1px solid ${c.border}`;
  el.style.display    = "flex";
  el.style.justifyContent = "space-between";
  el.style.alignItems = "center";
  el.innerHTML = `<span>${text}</span><span onclick="this.parentElement.style.display='none'" style="cursor:pointer;margin-left:8px;opacity:0.7;">✕</span>`;
}

async function askAllModels() {
  const chatInput = document.getElementById("chat-input");
  const question  = chatInput ? chatInput.value.trim() : "";
  // Do NOT close sidebar — user can close manually with X
  if (question) {
    if (typeof sendQuestion === "function") sendQuestion(question);
  } else {
    if (chatInput) chatInput.focus();
  }
}

async function validateKey(model, key) {
  const res = await fetch("/validate-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, key })
  });
  const data = await res.json();
  if (!data.valid) throw new Error(data.message);
  return data.message;
}

async function callGroq(question, context) {
  const key = getKey("groq");
  if (!key) throw new Error("No Groq API key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a helpful academic assistant." },
        { role: "user", content: context ? `Context: ${context}\n\nQuestion: ${question}` : question }
      ],
      max_tokens: 1024
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Groq error");
  return data.choices[0].message.content;
}

async function callGemini(question, context) {
  const key = getKey("gemini");
  if (!key) throw new Error("No Gemini API key");
  const prompt = context ? `Context: ${context}\n\nQuestion: ${question}\n\nAnswer based on context:` : question;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024 } })
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini error");
  return data.candidates[0].content.parts[0].text;
}

async function callDeepSeek(question, context) {
  const key = getKey("deepseek");
  if (!key) throw new Error("No DeepSeek API key");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful academic assistant." },
        { role: "user", content: context ? `Context: ${context}\n\nQuestion: ${question}` : question }
      ],
      max_tokens: 1024
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "DeepSeek error");
  return data.choices[0].message.content;
}

async function callOpenRouter(question, context) {
  const key = getKey("openrouter");
  if (!key) throw new Error("No OpenRouter API key");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Smart Academic Assistant"
    },
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free",
      messages: [
        { role: "system", content: "You are a helpful academic assistant." },
        { role: "user", content: context ? `Context: ${context}\n\nQuestion: ${question}` : question }
      ],
      max_tokens: 1024
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenRouter error");
  return data.choices[0].message.content;
}

loadSavedKeys();