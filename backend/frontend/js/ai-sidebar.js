// js/ai-sidebar.js — Multi-AI model integration (fixed)

const MODELS = {
  groq: { name: "Groq (Llama 3)", icon: "⚡", color: "#f97316", call: callGroq },
  gemini: { name: "Google Gemini", icon: "✨", color: "#4285f4", call: callGemini },
  deepseek: { name: "DeepSeek", icon: "🧠", color: "#6366f1", call: callDeepSeek },
  openrouter: { name: "OpenRouter", icon: "🌐", color: "#10b981", call: callOpenRouter }
};

// ── Sidebar open/close ────────────────────────────────────────────────────────

function openSidebar() {
  document.getElementById("ai-sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("show");
  loadSavedKeys();
}

function closeSidebar() {
  document.getElementById("ai-sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
}

// ── Key management ────────────────────────────────────────────────────────────

async function saveKey(model) {
  const inputEl = document.getElementById(`key-${model}`);
  const val = inputEl ? inputEl.value.trim() : "";
  const btn = document.getElementById(`save-btn-${model}`);

  if (!val) {
    showKeyMessage(model, "⚠️ Please enter your API key", "warn");
    return;
  }

  // Show validating state on button
  if (btn) { btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i>"; btn.disabled = true; }

  try {
    await validateKey(model, val);

    // ✅ Valid — save to localStorage
    localStorage.setItem(`key-${model}`, val);
    localStorage.setItem(`ai_enabled_${model}`, "true");

    // Enable toggle + card
    const toggle = document.getElementById(`toggle-${model}`);
    const card   = document.getElementById(`card-${model}`);
    if (toggle) toggle.checked = true;
    if (card)   card.classList.add("active");

    showKeyMessage(model, `✅ ${model.charAt(0).toUpperCase() + model.slice(1)} key accepted!`, "success");

    // Auto-close sidebar after 1.2s
    setTimeout(() => closeSidebar(), 1200);

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
      // Groq always active — backend default key
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

function toggleModel(model) {
  const checked = document.getElementById(`toggle-${model}`).checked;
  localStorage.setItem(`ai_enabled_${model}`, checked);
  const card = document.getElementById(`card-${model}`);
  if (card) {
    if (checked) card.classList.add("active");
    else         card.classList.remove("active");
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

// ── Inline per-card message ───────────────────────────────────────────────────

function showKeyMessage(model, text, type) {
  const msgId = `msg-${model}`;
  let el = document.getElementById(msgId);
  if (!el) {
    el = document.createElement("div");
    el.id = msgId;
    el.style.cssText = "font-size:0.8rem;margin-top:6px;padding:6px 10px;border-radius:6px;";
    const card = document.getElementById(`card-${model}`);
    if (card) card.appendChild(el);
  }
  const colors = {
    success: { bg: "#0d2e1a", color: "#22c55e", border: "#166534" },
    error:   { bg: "#2e0d0d", color: "#ef4444", border: "#7f1d1d" },
    warn:    { bg: "#2e2000", color: "#f59e0b", border: "#78350f" },
  };
  const c = colors[type] || colors.warn;
  el.style.background = c.bg;
  el.style.color      = c.color;
  el.style.border     = `1px solid ${c.border}`;
  el.textContent      = text;
  if (type !== "error") setTimeout(() => el && el.remove(), 3000);
}

// ── Ask all models button ─────────────────────────────────────────────────────

async function askAllModels() {
  const chatInput = document.getElementById("chat-input");
  const question  = chatInput ? chatInput.value.trim() : "";

  // Close sidebar first — no toast from here
  closeSidebar();

  if (question) {
    // Question already typed — send it
    if (typeof sendQuestion === "function") sendQuestion(question);
  } else {
    // No question — just focus the input
    if (chatInput) chatInput.focus();
  }
}

// ── Validate API keys ─────────────────────────────────────────────────────────

async function validateKey(model, key) {
  if (model === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!res.ok) throw new Error("Invalid key");
    return true;
  }
  if (model === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (!res.ok) throw new Error("Invalid key");
    return true;
  }
  if (model === "deepseek") {
    const res = await fetch("https://api.deepseek.com/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!res.ok) throw new Error("Invalid key");
    return true;
  }
  if (model === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Authorization": `Bearer ${key}` }
    });
    if (!res.ok) throw new Error("Invalid key");
    return true;
  }
}

// ── Model API calls (kept for direct frontend use) ────────────────────────────

async function callGroq(question, context) {
  const key = getKey("groq");
  if (!key) throw new Error("No Groq API key — add it in the sidebar");
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
  if (!key) throw new Error("No Gemini API key — add it in the sidebar");
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
  if (!key) throw new Error("No DeepSeek API key — add it in the sidebar");
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
  if (!key) throw new Error("No OpenRouter API key — add it in the sidebar");
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

// Init
loadSavedKeys();