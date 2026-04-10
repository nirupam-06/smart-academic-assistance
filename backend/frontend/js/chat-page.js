// js/chat-page.js — chat UI with Neo4j session support

const API_BASE = "https://smart-academic-assistance-production.up.railway.app";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("chat-input");
const messages   = document.getElementById("chat-messages");
const uploadBtn  = document.getElementById("upload-btn");
const fileInput  = document.getElementById("file-input");
const historyBtn = document.getElementById("history-btn");
const clearBtn   = document.getElementById("clear-btn");

// ── Session ID ────────────────────────────────────────────────────────────────
// One session per browser. Persisted in localStorage so history is scoped per user.

async function getSessionId() {
  let sid = localStorage.getItem("saa-session-id");
  if (!sid) {
    try {
      const res  = await fetch(`${API_BASE}/session`, { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" });
      const data = await res.json();
      sid = data.session_id;
      localStorage.setItem("saa-session-id", sid);
    } catch (e) {
      sid = "local-" + Math.random().toString(36).slice(2);
      localStorage.setItem("saa-session-id", sid);
    }
  }
  return sid;
}

// Initialize session on page load
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

function typingBubble() {
  return appendMessage("assistant", `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>`);
}

function formatAnswer(text, sources) {
  let html = `<p>${text.replace(/\n/g, "<br>")}</p>`;
  if (sources && sources.length) {
    html += `<p class="sources">📄 Sources: ${sources.join(", ")}</p>`;
  }
  return html;
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Send question ─────────────────────────────────────────────────────────────

async function sendQuestion(question) {
  appendMessage("user", `<p>${question}</p>`);
  input.value = "";
  input.disabled = true;
  const bubble = typingBubble();

  try {
    const groqKey       = localStorage.getItem("key-groq");
    const geminiKey     = localStorage.getItem("key-gemini");
    const deepseekKey   = localStorage.getItem("key-deepseek");
    const openrouterKey = localStorage.getItem("key-openrouter");
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

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");

    bubble.innerHTML = formatAnswer(data.answer, data.sources);

    // Show which models responded
    if (data.individual_answers) {
      const models = Object.keys(data.individual_answers).join(", ");
      bubble.innerHTML += `<p class="sources" style="opacity:0.5;font-size:0.75rem;">🤖 ${models}</p>`;
    }

  } catch (err) {
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

// ── History (session-scoped) ──────────────────────────────────────────────────

async function showHistory() {
  const notice = appendMessage("system", `<p>⏳ Loading your session history…</p>`);
  try {
    const sid = _sessionId || await getSessionId();
    const res  = await fetch(`${API_BASE}/history?session_id=${sid}&limit=20`);
    const data = await res.json();
    if (!res.ok) throw new Error("Could not load history");

    if (!data.length) {
      notice.innerHTML = `<p>📭 No history in this session yet.</p>`;
      return;
    }

    notice.remove();
    appendMessage("system", `<p><strong>📜 Last ${data.length} Q&amp;A in this session:</strong></p>`);
    data.reverse().forEach(item => {
      appendMessage("user", `<p>${item.question}</p>`);
      appendMessage("assistant",
        formatAnswer(item.answer, item.sources) +
        `<p class="sources">🕐 ${(item.timestamp || "").replace("T"," ").slice(0,19)} UTC</p>`
      );
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
}

async function clearHistory() {
  if (!confirm("Clear your session history from the graph?")) return;
  try {
    const sid = _sessionId || await getSessionId();
    const res  = await fetch(`${API_BASE}/history?session_id=${sid}`, { method: "DELETE" });
    const data = await res.json();
    appendMessage("system", `<p>🗑️ ${data.message}</p>`);
  } catch (err) {
    appendMessage("system", `<p class="error">⚠️ ${err.message}</p>`);
  }
}

// ── History Search ────────────────────────────────────────────────────────────

async function searchHistory(query) {
  if (!query) return;
  const notice = appendMessage("system", `<p>🔍 Searching graph for: <em>${query}</em>…</p>`);
  try {
    const res  = await fetch(`${API_BASE}/history/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error("Search failed");

    if (!data.length) {
      notice.innerHTML = `<p>📭 No results found for "${query}"</p>`;
      return;
    }

    notice.remove();
    appendMessage("system", `<p><strong>🔍 ${data.length} results from graph:</strong></p>`);
    data.forEach(item => {
      appendMessage("user", `<p>${item.question}</p>`);
      appendMessage("assistant", `<p>${item.answer.slice(0, 300)}…</p>`);
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

form      && form.addEventListener("submit", e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) {
    showToast("⚠️ Please type a question to continue", "warn");
    return;
  }
  sendQuestion(q);
});

uploadBtn && uploadBtn.addEventListener("click",  () => fileInput && fileInput.click());
fileInput && fileInput.addEventListener("change", () => { if (fileInput.files[0]) uploadPDF(fileInput.files[0]); });
historyBtn && historyBtn.addEventListener("click", showHistory);
clearBtn  && clearBtn.addEventListener("click",  clearHistory);

// Auto-resize textarea
input && input.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

// Enter to send, Shift+Enter for newline
input && input.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const q = input.value.trim();
    if (q && !input.disabled) sendQuestion(q);
  }
});

// Expose searchHistory for potential search bar in HTML
window.searchHistory = searchHistory;
