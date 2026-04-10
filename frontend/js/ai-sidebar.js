// js/ai-sidebar.js — Multi-AI model integration

const MODELS = {
  groq: {
    name: "Groq (Llama 3)",
    icon: "⚡",
    color: "#f97316",
    call: callGroq
  },
  gemini: {
    name: "Google Gemini",
    icon: "✨",
    color: "#4285f4",
    call: callGemini
  },
  deepseek: {
    name: "DeepSeek",
    icon: "🧠",
    color: "#6366f1",
    call: callDeepSeek
  },
  openrouter: {
    name: "OpenRouter",
    icon: "🌐",
    color: "#10b981",
    call: callOpenRouter
  }
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

function saveKey(model) {
  const val = document.getElementById(`key-${model}`).value.trim();
  if (val) {
    localStorage.setItem(`ai_key_${model}`, val);
    const btn = document.querySelector(`#card-${model} .key-save i`);
    btn.className = "fas fa-check-circle";
    btn.style.color = "#22c55e";
    setTimeout(() => {
      btn.className = "fas fa-check";
      btn.style.color = "";
    }, 1500);
  }
}

function loadSavedKeys() {
  ["groq", "gemini", "deepseek", "openrouter"].forEach(model => {
    const saved = localStorage.getItem(`ai_key_${model}`);
    if (saved) {
      document.getElementById(`key-${model}`).value = saved;
    }
    const enabled = localStorage.getItem(`ai_enabled_${model}`);
    if (enabled === "true") {
      document.getElementById(`toggle-${model}`).checked = true;
      document.getElementById(`card-${model}`).classList.add("active");
    }
  });
}

function toggleModel(model) {
  const checked = document.getElementById(`toggle-${model}`).checked;
  localStorage.setItem(`ai_enabled_${model}`, checked);
  const card = document.getElementById(`card-${model}`);
  if (checked) card.classList.add("active");
  else card.classList.remove("active");
}

function getActiveModels() {
  return ["groq", "gemini", "deepseek", "openrouter"].filter(m =>
    document.getElementById(`toggle-${m}`).checked
  );
}

function getKey(model) {
  return document.getElementById(`key-${model}`)?.value.trim() ||
    localStorage.getItem(`ai_key_${model}`) || "";
}

// ── Ask all models ────────────────────────────────────────────────────────────

async function askAllModels() {
  const question = document.getElementById("chat-input").value.trim();
  if (!question) {
    alert("Type a question first!");
    return;
  }

  const active = getActiveModels();
  if (active.length === 0) {
    alert("Enable at least one model first!");
    return;
  }

  closeSidebar();

  // Show user message
  appendMessage("user", `<p>${question}</p>`);
  document.getElementById("chat-input").value = "";
  document.getElementById("chat-input").style.height = "auto";

  // Get context from your RAG backend
  let context = "";
  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    context = data.answer || "";
  } catch (e) {}

  // Create multi-response container
  const container = document.createElement("div");
  container.className = "message assistant";
  container.innerHTML = `
    <div class="msg-avatar"><i class="fas fa-robot"></i></div>
    <div class="bubble" style="width:100%;max-width:680px;">
      <div style="font-size:0.8rem;color:#9999bb;margin-bottom:12px;">
        <i class="fas fa-bolt" style="color:#a855f7;"></i> Asking ${active.length} AI models simultaneously...
      </div>
      <div class="multi-response" id="multi-response-container"></div>
    </div>`;
  document.getElementById("chat-messages").appendChild(container);
  document.getElementById("chat-messages").scrollTop = 99999;

  const responseContainer = document.getElementById("multi-response-container");

  // Add placeholder cards
  active.forEach(model => {
    const card = document.createElement("div");
    card.className = "ai-response-card";
    card.id = `response-${model}`;
    card.innerHTML = `
      <div class="ai-response-header">
        <span>${MODELS[model].icon}</span>
        <span style="color:${MODELS[model].color}">${MODELS[model].name}</span>
        <span style="margin-left:auto;color:#55556a;font-weight:400;">thinking...</span>
      </div>
      <div class="ai-response-body">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>`;
    responseContainer.appendChild(card);
  });

  // Call all models in parallel
  await Promise.all(active.map(async model => {
    const card = document.getElementById(`response-${model}`);
    try {
      const answer = await MODELS[model].call(question, context);
      card.querySelector(".ai-response-header").innerHTML = `
        <span>${MODELS[model].icon}</span>
        <span style="color:${MODELS[model].color}">${MODELS[model].name}</span>
        <span style="margin-left:auto;color:#22c55e;font-weight:400;font-size:0.75rem;">✓ done</span>`;
      card.querySelector(".ai-response-body").innerHTML = answer.replace(/\n/g, "<br>");
    } catch (err) {
      card.querySelector(".ai-response-header").innerHTML = `
        <span>${MODELS[model].icon}</span>
        <span style="color:${MODELS[model].color}">${MODELS[model].name}</span>
        <span style="margin-left:auto;color:#e63946;font-weight:400;font-size:0.75rem;">✗ error</span>`;
      card.querySelector(".ai-response-body").innerHTML =
        `<span style="color:#e63946;">${err.message}</span>`;
    }
    document.getElementById("chat-messages").scrollTop = 99999;
  }));
}

// ── Model API calls ───────────────────────────────────────────────────────────

async function callGroq(question, context) {
  const key = getKey("groq");
  if (!key) throw new Error("No Groq API key — add it in the sidebar");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a helpful academic assistant. Use the context provided to answer the question accurately." },
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

  const prompt = context
    ? `Context from document: ${context}\n\nQuestion: ${question}\n\nAnswer based on the context:`
    : question;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024 }
      })
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
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
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

// Load saved state on page load
loadSavedKeys();
