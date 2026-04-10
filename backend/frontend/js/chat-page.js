// chat-page.js — Multi-model RAG chat with all features

const API_BASE = "https://smart-academic-assistance-production.up.railway.app";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("chat-input");
const messages   = document.getElementById("chat-messages");
const uploadBtn  = document.getElementById("upload-btn");
const fileInput  = document.getElementById("file-input");
const historyBtn = document.getElementById("history-btn");
const clearBtn   = document.getElementById("clear-btn");

// ── Session ───────────────────────────────────────────────────────────────────

async function getSessionId() {
  let sid = localStorage.getItem("saa-session-id");
  if (!sid) {
    try {
      const res  = await fetch(`${API_BASE}/session`, { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" });
      const data = await res.json();
      sid = data.session_id;
      localStorage.setItem("saa-session-id", sid);
    } catch {
      sid = "local-" + Math.random().toString(36).slice(2);
      localStorage.setItem("saa-session-id", sid);
    }
  }
  return sid;
}

let _sessionId = null;
getSessionId().then(sid => { _sessionId = sid; });

// ── Helpers ───────────────────────────────────────────────────────────────────

function appendMessage(role, html) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = html;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function md(text) {
  if (typeof marked !== "undefined") {
    try { return marked.parse(text); } catch {}
  }
  return text.replace(/\n/g, "<br>");
}

// ── Sources renderer ──────────────────────────────────────────────────────────

function renderSources(sources) {
  if (!sources || !sources.length) return "";

  // Handle both legacy string[] and new object[] format
  const items = sources.map(s => {
    if (typeof s === "string") return `<span class="src-chip" title="${s}">📄 ${s}</span>`;
    return `
      <span class="src-chip" title="Chunk ${s.chunk}: ${s.preview}">
        📄 ${s.file} <span style="opacity:0.6;font-size:0.7rem;">§${s.chunk}</span>
      </span>`;
  });

  return `<div class="src-row">${items.join("")}</div>`;
}

// ── Model comparison panel ────────────────────────────────────────────────────

const MODEL_META = {
  groq:       { icon: "⚡", color: "#f97316", label: "Groq · Llama 3" },
  gemini:     { icon: "✨", color: "#4285f4", label: "Google Gemini" },
  deepseek:   { icon: "🧠", color: "#6366f1", label: "DeepSeek" },
  openrouter: { icon: "🌐", color: "#10b981", label: "OpenRouter" },
};

function renderModelPanel(individualAnswers) {
  if (!individualAnswers || !Object.keys(individualAnswers).length) return "";
  const models = Object.entries(individualAnswers).filter(([, v]) => v && !v.toLowerCase().includes("error:"));
  if (models.length <= 1) return "";

  const cards = models.map(([name, ans]) => {
    const meta = MODEL_META[name] || { icon: "🤖", color: "#9999bb", label: name };
    return `
      <div class="model-ans-card" style="border-left:3px solid ${meta.color};">
        <div class="model-ans-header">
          <span>${meta.icon}</span>
          <span style="color:${meta.color}; font-weight:600; font-size:0.8rem;">${meta.label}</span>
        </div>
        <div class="model-ans-body md-body">${md(ans)}</div>
      </div>`;
  }).join("");

  return `
    <div class="compare-toggle-row">
      <button class="compare-toggle-btn" onclick="
        const p=this.nextElementSibling;
        const open=p.style.display!=='none';
        p.style.display=open?'none':'flex';
        this.textContent=open?'🔬 Show individual model answers':'🔼 Hide model answers';
      ">🔬 Show individual model answers</button>
      <div class="model-ans-grid" style="display:none;">${cards}</div>
    </div>`;
}

// ── Follow-up suggestions ─────────────────────────────────────────────────────

const FOLLOWUPS = [
  "Explain this in simple terms",
  "Give me a real-world example",
  "Create a quiz on this topic",
  "Summarize in bullet points",
  "What are the key takeaways?",
  "How does this relate to other concepts?",
  "Give me a step-by-step breakdown",
  "What should I study next?",
];

function renderFollowups(question) {
  // Pick 3 contextually relevant chips
  const picks = FOLLOWUPS.sort(() => 0.5 - Math.random()).slice(0, 3);
  const chips = picks.map(f =>
    `<button class="followup-chip" onclick="sendFollowup('${f.replace(/'/g, "\\'")}', '${question.replace(/'/g, "\\'")}')">${f}</button>`
  ).join("");
  return `<div class="followup-row">${chips}</div>`;
}

function sendFollowup(followup, originalQ) {
  const combined = `${followup} (regarding: "${originalQ.slice(0, 60)}")`;
  input.value = followup;
  sendQuestion(combined);
}

// ── Quick action buttons on answers ──────────────────────────────────────────

function renderQuickActions(answer) {
  const escaped = answer.replace(/`/g, "\\`").replace(/\$/g, "\\$");
  return `
    <div class="quick-actions-row">
      <button class="qa-btn" onclick="quickTransform(this, 'simplify')">🎓 Simplify</button>
      <button class="qa-btn" onclick="quickTransform(this, 'bullets')">📌 Make Notes</button>
      <button class="qa-btn" onclick="quickTransform(this, 'quiz')">🎯 Quiz Me</button>
      <button class="qa-btn copy-ans-btn" onclick="
        navigator.clipboard.writeText(\`${escaped}\`);
        this.textContent='✅ Copied!';
        setTimeout(()=>this.textContent='📋 Copy',1500);
      ">📋 Copy</button>
    </div>`;
}

async function quickTransform(btn, mode) {
  const bubble = btn.closest(".message");
  const answerEl = bubble.querySelector(".md-body");
  if (!answerEl) return;
  const originalText = answerEl.innerText;

  const prompts = {
    simplify: `Explain the following in very simple terms, like explaining to a 15-year-old student. Use simple words and analogies:\n\n${originalText}`,
    bullets:  `Convert the following into clear, concise bullet point notes perfect for revision. Use headers and sub-bullets:\n\n${originalText}`,
    quiz:     `Create 3 multiple choice questions based on the following content. Format each as:\nQ: [question]\nA) [option] B) [option] C) [option] D) [option]\nAnswer: [letter]\n\n${originalText}`,
  };

  btn.disabled = true;
  btn.textContent = "⏳";

  const groqKey = localStorage.getItem("key-groq") || "";
  const geminiKey = localStorage.getItem("key-gemini") || "";
  const openrouterKey = localStorage.getItem("key-openrouter") || "";

  try {
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: prompts[mode],
        session_id: _sessionId || await getSessionId(),
        keys: { groq: groqKey, gemini: geminiKey, deepseek: "", openrouter: openrouterKey }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const transformed = appendMessage("assistant", `
      <div class="transform-label">${mode === "simplify" ? "🎓 Simplified" : mode === "bullets" ? "📌 Notes" : "🎯 Quiz"}</div>
      <div class="md-body">${md(data.answer)}</div>
    `);
    transformed.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch(e) {
    showToast(`⚠️ ${e.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = mode === "simplify" ? "🎓 Simplify" : mode === "bullets" ? "📌 Make Notes" : "🎯 Quiz Me";
  }
}

// ── Loading states ────────────────────────────────────────────────────────────

const LOADING_STATES = [
  "🧠 Thinking...",
  "🔍 Searching document...",
  "⚡ Generating answer...",
  "🤖 Consulting models...",
  "📝 Synthesizing response...",
];

function animatedBubble() {
  const div = document.createElement("div");
  div.className = "message assistant loading-bubble";
  div.innerHTML = `<p class="loading-text">${LOADING_STATES[0]}</p>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  let i = 0;
  const interval = setInterval(() => {
    i = (i + 1) % LOADING_STATES.length;
    const el = div.querySelector(".loading-text");
    if (el) el.textContent = LOADING_STATES[i];
  }, 1500);

  div._stopAnimation = () => clearInterval(interval);
  return div;
}

// ── Send question with retry ──────────────────────────────────────────────────

async function sendQuestion(question, retryCount = 0) {
  if (retryCount === 0) {
    appendMessage("user", `<p>${question}</p>`);
    input.value = "";
    input.disabled = true;
  }

  const bubble = animatedBubble();

  try {
    const groqKey       = localStorage.getItem("key-groq")       || "";
    const geminiKey     = localStorage.getItem("key-gemini")     || "";
    const deepseekKey   = localStorage.getItem("key-deepseek")   || "";
    const openrouterKey = localStorage.getItem("key-openrouter") || "";
    const sid           = _sessionId || await getSessionId();

    const res = await fetch(`${API_BASE}/ask`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        session_id: sid,
        keys: { groq: groqKey, gemini: geminiKey, deepseek: deepseekKey, openrouter: openrouterKey }
      }),
    });

    if (res.status === 429) {
      bubble._stopAnimation();
      bubble.remove();
      if (retryCount < 2) {
        const retryMsg = appendMessage("system", `<p>⚡ Model busy, retrying... (${retryCount + 1}/2)</p>`);
        await new Promise(r => setTimeout(r, 3000));
        retryMsg.remove();
        return sendQuestion(question, retryCount + 1);
      } else {
        appendMessage("assistant", `<p class="error">⚠️ Model is too busy right now. Please try again in a moment.</p>`);
        return;
      }
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");

    bubble._stopAnimation();

    // ── Assemble rich answer bubble ───────────────────────────────────────────
    const modelTag = data.models_used && data.models_used.length > 1
      ? `<span class="model-tag multi">🤖 ${data.models_used.join(" + ")}</span>`
      : data.models_used && data.models_used.length === 1
        ? `<span class="model-tag">${MODEL_META[data.models_used[0]]?.icon || "🤖"} ${data.models_used[0]}</span>`
        : "";

    bubble.innerHTML = `
      <div class="md-body">${md(data.answer)}</div>
      ${renderSources(data.sources)}
      ${modelTag}
      ${renderModelPanel(data.individual_answers)}
      ${renderQuickActions(data.answer)}
      ${renderFollowups(question)}
    `;
    bubble.classList.remove("loading-bubble");

    // Add copy buttons to code blocks
    bubble.querySelectorAll("pre code").forEach(block => {
      const wrap = block.parentElement;
      if (wrap.querySelector(".code-copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.textContent = "Copy";
      btn.onclick = () => {
        navigator.clipboard.writeText(block.innerText);
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = "Copy", 1500);
      };
      wrap.style.position = "relative";
      wrap.appendChild(btn);
    });

  } catch (err) {
    bubble._stopAnimation();
    bubble.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// ── Upload PDF ────────────────────────────────────────────────────────────────

async function uploadPDF(file) {
  const notice = appendMessage("system", `<p>⏳ Uploading <b>${file.name}</b>…</p>`);
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res  = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    notice.innerHTML = `<p>✅ ${data.message}</p>`;
    showToast(`📄 ${file.name} indexed (${data.chunks} chunks)`, "success");
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ Upload failed: ${err.message}</p>`;
  }
}

// ── History ───────────────────────────────────────────────────────────────────

async function showHistory() {
  const notice = appendMessage("system", `<p>⏳ Loading history…</p>`);
  try {
    const sid  = _sessionId || await getSessionId();
    const res  = await fetch(`${API_BASE}/history?session_id=${sid}&limit=20`);
    const data = await res.json();
    if (!data.length) { notice.innerHTML = `<p>📭 No history yet.</p>`; return; }
    notice.remove();
    appendMessage("system", `<p><strong>📜 Last ${data.length} Q&amp;A:</strong></p>`);
    data.reverse().forEach(item => {
      appendMessage("user", `<p>${item.question}</p>`);
      const ansDiv = appendMessage("assistant", `
        <div class="md-body">${md(item.answer)}</div>
        <p class="sources" style="opacity:0.5;font-size:0.75rem;">🕐 ${(item.timestamp||"").replace("T"," ").slice(0,19)} UTC</p>
      `);
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
}

async function clearHistory() {
  if (!confirm("Clear session history?")) return;
  const sid = _sessionId || await getSessionId();
  const res = await fetch(`${API_BASE}/history?session_id=${sid}`, { method: "DELETE" });
  const data = await res.json();
  appendMessage("system", `<p>🗑️ ${data.message}</p>`);
}

// ── Voice Input ───────────────────────────────────────────────────────────────

let _recognition = null;
let _isListening = false;

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const micBtn = document.createElement("button");
  micBtn.id = "mic-btn";
  micBtn.className = "icon-btn";
  micBtn.title = "Voice input";
  micBtn.innerHTML = `<i class="fas fa-microphone"></i>`;
  micBtn.style.cssText = "color:#a855f7; border-color:rgba(168,85,247,0.3);";

  // Insert mic button before send button
  const sendBtn = document.querySelector(".send-btn");
  if (sendBtn) sendBtn.parentElement.insertBefore(micBtn, sendBtn);

  _recognition = new SpeechRecognition();
  _recognition.continuous = false;
  _recognition.interimResults = true;
  _recognition.lang = "en-US";

  _recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
    input.value = transcript;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  };

  _recognition.onend = () => {
    _isListening = false;
    micBtn.style.color = "#a855f7";
    micBtn.innerHTML = `<i class="fas fa-microphone"></i>`;
    if (input.value.trim()) sendQuestion(input.value.trim());
  };

  _recognition.onerror = () => {
    _isListening = false;
    micBtn.style.color = "#a855f7";
    micBtn.innerHTML = `<i class="fas fa-microphone"></i>`;
    showToast("⚠️ Voice input failed — try again", "warn");
  };

  micBtn.addEventListener("click", () => {
    if (_isListening) {
      _recognition.stop();
    } else {
      _isListening = true;
      micBtn.style.color = "#ef4444";
      micBtn.innerHTML = `<i class="fas fa-microphone-slash"></i>`;
      showToast("🎤 Listening… speak now", "info");
      _recognition.start();
    }
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────

form && form.addEventListener("submit", e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) { showToast("⚠️ Please type a question to continue", "warn"); return; }
  sendQuestion(q);
});

uploadBtn  && uploadBtn.addEventListener("click",  () => fileInput && fileInput.click());
fileInput  && fileInput.addEventListener("change", () => {
  if (!fileInput.files[0]) return;
  const f = fileInput.files[0];
  if (f.type === "application/pdf") uploadPDF(f);
  else if (f.type.startsWith("image/")) handleImage(f, input.value.trim());
});
historyBtn && historyBtn.addEventListener("click",  showHistory);
clearBtn   && clearBtn.addEventListener("click",   clearHistory);

input && input.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

input && input.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const q = input.value.trim();
    if (q && !input.disabled) sendQuestion(q);
  }
});

// Init voice after DOM ready
document.addEventListener("DOMContentLoaded", setupVoiceInput);
setTimeout(setupVoiceInput, 500); // fallback

// ── Image handling ────────────────────────────────────────────────────────────

async function handleImage(file, question) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const mime   = file.type;

    appendMessage("user", `
      <img src="${reader.result}" style="max-width:100%;max-height:200px;border-radius:8px;margin-bottom:6px;display:block;">
      <p>${question || "What is in this image?"}</p>
    `);

    const bubble = animatedBubble();
    const allKeys = {
      gemini:     localStorage.getItem("key-gemini")     || "",
      openrouter: localStorage.getItem("key-openrouter") || "",
      groq:       localStorage.getItem("key-groq")       || "",
    };

    try {
      const res = await fetch(`${API_BASE}/ask-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question || "Describe this image in detail.", image: base64, mime_type: mime, keys: allKeys })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image analysis failed");
      bubble._stopAnimation();
      const modelLabel = data.model_used || "Vision AI";
      bubble.innerHTML = `
        <div class="md-body">${md(data.answer)}</div>
        <span class="model-tag">🔍 ${modelLabel}</span>
        ${renderQuickActions(data.answer)}
      `;
      bubble.classList.remove("loading-bubble");
    } catch (err) {
      bubble._stopAnimation();
      bubble.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
    }
  };
  reader.readAsDataURL(file);
}

// Ctrl+V paste image
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      handleImage(item.getAsFile(), input.value.trim());
      input.value = "";
      return;
    }
  }
});

// Drag & drop
const chatBody = document.querySelector(".chat-body");
chatBody && chatBody.addEventListener("dragover", e => e.preventDefault());
chatBody && chatBody.addEventListener("drop", e => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file?.type.startsWith("image/")) handleImage(file, input.value.trim());
  else if (file?.name?.endsWith(".pdf")) uploadPDF(file);
});

// ── History search ────────────────────────────────────────────────────────────

window.searchHistory = async function(query) {
  if (!query) return;
  const notice = appendMessage("system", `<p>🔍 Searching for: <em>${query}</em>…</p>`);
  try {
    const res  = await fetch(`${API_BASE}/history/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!data.length) { notice.innerHTML = `<p>📭 No results for "${query}"</p>`; return; }
    notice.remove();
    data.forEach(item => {
      appendMessage("user", `<p>${item.question}</p>`);
      appendMessage("assistant", `<div class="md-body">${md(item.answer.slice(0,400))}…</div>`);
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
};
