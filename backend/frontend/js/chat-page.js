// js/chat-page.js — chat UI, /ask, /upload, /history

const API_BASE = "https://smart-academic-assistance-production.up.railway.app";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("chat-input");
const messages   = document.getElementById("chat-messages");
const uploadBtn  = document.getElementById("upload-btn");
const fileInput  = document.getElementById("file-input");
const historyBtn = document.getElementById("history-btn");
const clearBtn   = document.getElementById("clear-btn");

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

// ── Send question ─────────────────────────────────────────────────────────────

async function sendQuestion(question) {
  appendMessage("user", `<p>${question}</p>`);
  input.value = "";
  input.disabled = true;
  const bubble = typingBubble();

  try {
    const res  = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Server error");
    bubble.innerHTML = formatAnswer(data.answer, data.sources);
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
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ Upload failed: ${err.message}</p>`;
  }
}

// ── History ───────────────────────────────────────────────────────────────────

async function showHistory() {
  const notice = appendMessage("system", `<p>⏳ Loading history…</p>`);
  try {
    const res  = await fetch(`${API_BASE}/history`);
    const data = await res.json();
    if (!res.ok) throw new Error("Could not load history");

    if (!data.length) {
      notice.innerHTML = `<p>📭 No history yet.</p>`;
      return;
    }

    notice.remove();
    appendMessage("system", `<p><strong>📜 Last ${data.length} Q&amp;A pairs:</strong></p>`);
    data.reverse().forEach(item => {
      appendMessage("user",      `<p>${item.question}</p>`);
      appendMessage("assistant", formatAnswer(item.answer, item.sources) +
        `<p class="sources">🕐 ${item.timestamp.replace("T"," ").slice(0,19)} UTC</p>`);
    });
  } catch (err) {
    notice.innerHTML = `<p class="error">⚠️ ${err.message}</p>`;
  }
}

async function clearHistory() {
  if (!confirm("Clear all history?")) return;
  try {
    const res = await fetch(`${API_BASE}/history`, { method: "DELETE" });
    const data = await res.json();
    appendMessage("system", `<p>🗑️ ${data.message}</p>`);
  } catch (err) {
    appendMessage("system", `<p class="error">⚠️ ${err.message}</p>`);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

form       && form.addEventListener("submit", e => { e.preventDefault(); const q = input.value.trim(); if (q) sendQuestion(q); });
uploadBtn  && uploadBtn.addEventListener("click",  () => fileInput && fileInput.click());
fileInput  && fileInput.addEventListener("change", () => { if (fileInput.files[0]) uploadPDF(fileInput.files[0]); });
historyBtn && historyBtn.addEventListener("click",  showHistory);
clearBtn   && clearBtn.addEventListener("click",   clearHistory);

// Auto-resize textarea
input && input.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});
// Enter to send, Shift+Enter for new line
input && input.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const q = input.value.trim();
    if (q && !input.disabled) sendQuestion(q);
  }
});