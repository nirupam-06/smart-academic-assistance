// chat-page.js — Multi-model RAG chat with loading states + retry

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

function formatAnswer(text, sources) {
  let html = `<p>${text.replace(/\n/g, "<br>")}</p>`;
  if (sources && sources.length) {
    html += `<p class="sources">📄 Sources: ${sources.join(", ")}</p>`;
  }
  return html;
}

// ── Loading states ────────────────────────────────────────────────────────────

const LOADING_STATES = [
  "🧠 Thinking...",
  "🔍 Searching document...",
  "⚡ Generating answer...",
  "🤖 Consulting models...",
  "📝 Synthesizing response..."
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

    // 429 — rate limit, retry up to 2 times
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

    // Build answer HTML
    let answerHTML = formatAnswer(data.answer, data.sources);

    // Show which models responded
    if (data.models_used && data.models_used.length > 1) {
      answerHTML += `<p class="sources" style="opacity:0.5;font-size:0.75rem;">🤖 Synthesized from: ${data.models_used.join(", ")}</p>`;
    } else if (data.models_used && data.models_used.length === 1) {
      answerHTML += `<p class="sources" style="opacity:0.5;font-size:0.75rem;">🤖 ${data.models_used[0]}</p>`;
    }

    bubble.innerHTML = answerHTML;
    bubble.classList.remove("loading-bubble");

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
      appendMessage("assistant", formatAnswer(item.answer, item.sources) +
        `<p class="sources">🕐 ${(item.timestamp||"").replace("T"," ").slice(0,19)} UTC</p>`);
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

// ── Event listeners ───────────────────────────────────────────────────────────

form && form.addEventListener("submit", e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) { showToast("⚠️ Please type a question to continue", "warn"); return; }
  sendQuestion(q);
});

uploadBtn  && uploadBtn.addEventListener("click",  () => fileInput && fileInput.click());
fileInput  && fileInput.addEventListener("change", () => { if (fileInput.files[0]) uploadPDF(fileInput.files[0]); });
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
// ── Image paste / drag / upload ──────────────────────────────────────────────

async function handleImage(file, question) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const mime   = file.type;

    // Show image preview in chat
    appendMessage("user", `
      <img src="${reader.result}" style="max-width:100%;max-height:200px;border-radius:8px;margin-bottom:6px;display:block;">
      <p>${question || "What is in this image?"}</p>
    `);

    const bubble = animatedBubble();
    const geminiKey = localStorage.getItem("key-gemini") || "";

    try {
      const res = await fetch(`${API_BASE}/ask-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question || "Describe this image in detail.",
          image: base64,
          mime_type: mime,
          gemini_key: geminiKey
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image analysis failed");
      bubble._stopAnimation();
      bubble.innerHTML = `<p>${data.answer.replace(/\n/g, "<br>")}</p>
        <p class="sources" style="opacity:0.5;font-size:0.75rem;">🔍 Gemini Vision</p>`;
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
      const file = item.getAsFile();
      const question = input.value.trim();
      input.value = "";
      handleImage(file, question);
      return;
    }
  }
});

// Drag and drop image
const chatBody = document.querySelector(".chat-body");
chatBody && chatBody.addEventListener("dragover", e => e.preventDefault());
chatBody && chatBody.addEventListener("drop", e => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith("image/")) {
    const question = input.value.trim();
    input.value = "";
    handleImage(file, question);
  }
});

// Image upload button (reuse existing upload btn with image support)
document.getElementById("file-input") && 
  document.getElementById("file-input").setAttribute("accept", ".pdf,image/*");
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
      appendMessage("assistant", `<p>${item.answer.slice(0,300)}…</p>`);
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
};