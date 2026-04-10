// ── Smart Features ────────────────────────────────────────────────────────────

const RAILWAY = "https://smart-academic-assistance-production.up.railway.app";

function getKeys() {
  return {
    groq:       localStorage.getItem("key-groq")       || "",
    gemini:     localStorage.getItem("key-gemini")     || "",
    deepseek:   localStorage.getItem("key-deepseek")   || "",
    openrouter: localStorage.getItem("key-openrouter") || ""
  };
}

// ── Feature Panel UI ──────────────────────────────────────────────────────────

function openFeaturePanel(type) {
  const existing = document.getElementById("feature-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "feature-panel";
  panel.style.cssText = `
    position:fixed; top:0; right:0; width:min(520px,100vw); height:100vh;
    background:#0d0d1a; border-left:1px solid rgba(255,255,255,0.08);
    z-index:2000; display:flex; flex-direction:column;
    box-shadow:-8px 0 32px rgba(0,0,0,0.5); overflow:hidden;
    animation: slideIn 0.3s ease;
  `;

  const titles = {
    quiz: "🎯 Quiz Generator",
    mindmap: "🧠 Mind Map",
    studyplan: "📅 Study Plan",
    compare: "🔍 Compare Docs",
    memory: "💾 Session Memory"
  };

  panel.innerHTML = `
    <div style="padding:18px 20px; border-bottom:1px solid rgba(255,255,255,0.07);
      display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
      <h3 style="font-family:Syne,sans-serif; font-size:1rem; font-weight:700; color:#f0f0f8;">
        ${titles[type]}
      </h3>
      <button onclick="document.getElementById('feature-panel').remove()"
        style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
        color:#9999bb; width:30px; height:30px; border-radius:8px; cursor:pointer; font-size:0.9rem;">✕</button>
    </div>
    <div id="feature-body" style="flex:1; overflow-y:auto; padding:20px;"></div>
  `;

  document.body.appendChild(panel);

  const body = document.getElementById("feature-body");

  if (type === "quiz")      renderQuizSetup(body);
  if (type === "mindmap")   renderMindmapSetup(body);
  if (type === "studyplan") renderStudyPlanSetup(body);
  if (type === "compare")   renderCompareSetup(body);
  if (type === "memory")    renderMemory(body);
}

function getDocList() {
  const docs = [...new Set(
    Array.from(document.querySelectorAll(".sources"))
      .map(el => el.textContent.replace("📄 Sources:", "").trim())
      .filter(Boolean)
  )];
  return docs.length ? docs : ["all"];
}

// ── Quiz ──────────────────────────────────────────────────────────────────────

function renderQuizSetup(body) {
  body.innerHTML = `
    <p style="color:#9999bb; font-size:0.85rem; margin-bottom:16px;">
      Generate MCQ questions from your uploaded document to test yourself.
    </p>
    <label style="color:#ccc; font-size:0.82rem;">Number of questions</label>
    <div style="display:flex; gap:8px; margin:8px 0 16px;">
      ${[5,10,15].map(n => `
        <button onclick="document.querySelectorAll('.qnum-btn').forEach(b=>b.style.background='rgba(255,255,255,0.05)'); this.style.background='rgba(230,57,70,0.3)'; window._quizNum=${n};"
          class="qnum-btn"
          style="flex:1; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
          background:${n===10?'rgba(230,57,70,0.3)':'rgba(255,255,255,0.05)'}; color:#f0f0f8; cursor:pointer; font-size:0.85rem;">
          ${n} Qs
        </button>`).join("")}
    </div>
    <button onclick="startQuiz()"
      style="width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#e63946,#9333ea); color:#fff;
      font-family:Syne,sans-serif; font-weight:700; font-size:0.9rem;">
      ⚡ Generate Quiz
    </button>
    <div id="quiz-area" style="margin-top:20px;"></div>
  `;
  window._quizNum = 10;
}

async function startQuiz() {
  const area = document.getElementById("quiz-area");
  area.innerHTML = `<p style="color:#9999bb; text-align:center; padding:20px;">⏳ Generating quiz from your document...</p>`;

  try {
    const res  = await fetch(`${RAILWAY}/quiz`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ source:"all", keys: getKeys(), num_questions: window._quizNum || 10 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderQuiz(area, data);
  } catch(e) {
    area.innerHTML = `<p style="color:#ef4444;">❌ ${e.message}</p>`;
  }
}

function renderQuiz(area, data) {
  window._quizAnswers = {};
  window._quizData = data;
  area.innerHTML = `
    <h4 style="color:#f0f0f8; margin-bottom:16px; font-family:Syne,sans-serif;">${data.title || "Quiz"}</h4>
    ${data.questions.map((q, i) => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
        border-radius:10px; padding:14px; margin-bottom:12px;" id="q-card-${i}">
        <p style="color:#f0f0f8; font-size:0.88rem; margin-bottom:10px; font-weight:500;">
          ${i+1}. ${q.q}
        </p>
        ${q.options.map(opt => `
          <button onclick="selectAnswer(${i}, '${opt[0]}', this)"
            style="display:block; width:100%; text-align:left; padding:8px 12px; margin-bottom:6px;
            background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
            border-radius:8px; color:#d0d0e8; font-size:0.82rem; cursor:pointer; transition:all 0.2s;"
            class="opt-btn-${i}">
            ${opt}
          </button>`).join("")}
      </div>`).join("")}
    <button onclick="submitQuiz()"
      style="width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#22c55e,#16a34a); color:#fff;
      font-family:Syne,sans-serif; font-weight:700; font-size:0.9rem; margin-top:8px;">
      ✅ Submit & See Results
    </button>
  `;
}

function selectAnswer(qIdx, letter, btn) {
  document.querySelectorAll(`.opt-btn-${qIdx}`).forEach(b => {
    b.style.background = "rgba(255,255,255,0.04)";
    b.style.border = "1px solid rgba(255,255,255,0.08)";
    b.style.color = "#d0d0e8";
  });
  btn.style.background = "rgba(230,57,70,0.2)";
  btn.style.border = "1px solid rgba(230,57,70,0.4)";
  btn.style.color = "#f0f0f8";
  window._quizAnswers[qIdx] = letter;
}

function submitQuiz() {
  const data = window._quizData;
  let score = 0;
  data.questions.forEach((q, i) => {
    const card = document.getElementById(`q-card-${i}`);
    const userAns = window._quizAnswers[i];
    const correct = q.answer;
    const isRight = userAns === correct;
    if (isRight) score++;

    card.style.borderColor = isRight ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
    card.style.background  = isRight ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)";

    const explain = document.createElement("div");
    explain.style.cssText = "margin-top:8px; padding:8px 10px; border-radius:6px; font-size:0.78rem;";
    if (isRight) {
      explain.style.cssText += "background:rgba(34,197,94,0.1); color:#22c55e;";
      explain.innerHTML = `✅ Correct! ${q.explanation || ""}`;
    } else {
      explain.style.cssText += "background:rgba(239,68,68,0.1); color:#ef4444;";
      explain.innerHTML = `❌ Correct answer: ${correct}. ${q.explanation || ""}`;
    }
    card.appendChild(explain);
  });

  const pct = Math.round((score / data.questions.length) * 100);
  const scoreDiv = document.createElement("div");
  scoreDiv.style.cssText = `padding:16px; border-radius:12px; text-align:center; margin-bottom:16px;
    background:${pct>=70?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)"};
    border:1px solid ${pct>=70?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"};`;
  scoreDiv.innerHTML = `
    <div style="font-size:2rem; font-weight:800; color:${pct>=70?"#22c55e":"#ef4444"}; font-family:Syne,sans-serif;">
      ${score}/${data.questions.length}
    </div>
    <div style="color:#9999bb; font-size:0.85rem; margin-top:4px;">
      ${pct}% — ${pct>=80?"Excellent!":pct>=60?"Good job!":"Keep studying!"}
    </div>
  `;
  document.getElementById("quiz-area").prepend(scoreDiv);
}

// ── Mind Map ──────────────────────────────────────────────────────────────────

function renderMindmapSetup(body) {
  body.innerHTML = `
    <p style="color:#9999bb; font-size:0.85rem; margin-bottom:16px;">
      AI reads your document and draws an interactive visual concept map.
    </p>
    <button onclick="startMindmap()"
      style="width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#4285f4,#a855f7); color:#fff;
      font-family:Syne,sans-serif; font-weight:700; font-size:0.9rem;">
      🧠 Generate Mind Map
    </button>
    <div id="mindmap-area" style="margin-top:20px;"></div>
  `;
}

async function startMindmap() {
  const area = document.getElementById("mindmap-area");
  area.innerHTML = `<p style="color:#9999bb; text-align:center; padding:20px;">⏳ Building mind map from your document...</p>`;
  try {
    const res  = await fetch(`${RAILWAY}/mindmap`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ source:"all", keys: getKeys() })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderMindMap(area, data);
  } catch(e) {
    area.innerHTML = `<p style="color:#ef4444;">❌ ${e.message}</p>`;
  }
}

function renderMindMap(area, data) {
  const w = 460, h = 420, cx = w/2, cy = h/2;
  const branches = data.branches || [];
  const angleStep = (2 * Math.PI) / branches.length;

  let nodes = `<circle cx="${cx}" cy="${cy}" r="45" fill="rgba(230,57,70,0.15)" stroke="#e63946" stroke-width="2"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle"
      fill="#f0f0f8" font-size="11" font-weight="700" font-family="Syne,sans-serif">${wrapText(data.central, 12)}</text>`;

  branches.forEach((branch, i) => {
    const angle = i * angleStep - Math.PI/2;
    const bx = cx + Math.cos(angle) * 150;
    const by = cy + Math.sin(angle) * 130;
    const color = branch.color || "#e63946";

    nodes += `<line x1="${cx}" y1="${cy}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="2" opacity="0.5"/>`;
    nodes += `<ellipse cx="${bx}" cy="${by}" rx="55" ry="22" fill="${color}22" stroke="${color}" stroke-width="1.5"/>`;
    nodes += `<text x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="middle"
      fill="${color}" font-size="10" font-weight="600" font-family="DM Sans,sans-serif">${branch.name}</text>`;

    (branch.children || []).forEach((child, j) => {
      const spread = (j - (branch.children.length-1)/2) * 0.35;
      const childAngle = angle + spread;
      const cr = 95;
      const childX = bx + Math.cos(childAngle) * cr;
      const childY = by + Math.sin(childAngle) * cr;
      nodes += `<line x1="${bx}" y1="${by}" x2="${childX}" y2="${childY}" stroke="${color}" stroke-width="1" opacity="0.3"/>`;
      nodes += `<circle cx="${childX}" cy="${childY}" r="28" fill="rgba(255,255,255,0.03)" stroke="${color}" stroke-width="1" opacity="0.6"/>`;
      nodes += `<text x="${childX}" y="${childY}" text-anchor="middle" dominant-baseline="middle"
        fill="#d0d0e8" font-size="8.5" font-family="DM Sans,sans-serif">${child}</text>`;
    });
  });

  area.innerHTML = `
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:12px; overflow:hidden;">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block;">
        ${nodes}
      </svg>
    </div>
    <p style="color:#55556a; font-size:0.75rem; text-align:center; margin-top:8px;">
      Mind map generated from your document
    </p>
  `;
}

function wrapText(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

// ── Study Plan ────────────────────────────────────────────────────────────────

function renderStudyPlanSetup(body) {
  const today = new Date();
  const twoWeeks = new Date(today.getTime() + 14*24*60*60*1000);
  const defaultDate = twoWeeks.toISOString().split("T")[0];

  body.innerHTML = `
    <p style="color:#9999bb; font-size:0.85rem; margin-bottom:16px;">
      Tell us your exam date and we'll build a day-by-day study plan from your document.
    </p>
    <label style="color:#ccc; font-size:0.82rem; display:block; margin-bottom:6px;">Exam Date</label>
    <input type="date" id="exam-date" value="${defaultDate}"
      style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
      background:rgba(255,255,255,0.05); color:#f0f0f8; font-size:0.85rem; margin-bottom:14px;">

    <label style="color:#ccc; font-size:0.82rem; display:block; margin-bottom:6px;">Hours available per day</label>
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      ${[1,2,3,4,5].map(h => `
        <button onclick="document.querySelectorAll('.hrs-btn').forEach(b=>b.style.background='rgba(255,255,255,0.05)'); this.style.background='rgba(230,57,70,0.3)'; window._studyHours=${h};"
          class="hrs-btn"
          style="flex:1; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
          background:${h===3?'rgba(230,57,70,0.3)':'rgba(255,255,255,0.05)'}; color:#f0f0f8; cursor:pointer; font-size:0.82rem;">
          ${h}h
        </button>`).join("")}
    </div>
    <button onclick="startStudyPlan()"
      style="width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#22c55e,#059669); color:#fff;
      font-family:Syne,sans-serif; font-weight:700; font-size:0.9rem;">
      📅 Generate Study Plan
    </button>
    <div id="plan-area" style="margin-top:20px;"></div>
  `;
  window._studyHours = 3;
}

async function startStudyPlan() {
  const area = document.getElementById("plan-area");
  const examDate = document.getElementById("exam-date").value;
  area.innerHTML = `<p style="color:#9999bb; text-align:center; padding:20px;">⏳ Building your personalized study plan...</p>`;
  try {
    const res  = await fetch(`${RAILWAY}/studyplan`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ source:"all", exam_date: examDate, hours_per_day: window._studyHours || 3, keys: getKeys() })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderStudyPlan(area, data);
  } catch(e) {
    area.innerHTML = `<p style="color:#ef4444;">❌ ${e.message}</p>`;
  }
}

function renderStudyPlan(area, data) {
  const days = data.days || [];
  area.innerHTML = `
    <div style="background:rgba(34,197,94,0.05); border:1px solid rgba(34,197,94,0.2);
      border-radius:10px; padding:14px; margin-bottom:16px;">
      <h4 style="color:#22c55e; font-family:Syne,sans-serif; margin-bottom:4px;">${data.title}</h4>
      <p style="color:#9999bb; font-size:0.8rem;">📅 Exam: ${data.exam_date} · ⏱ ${data.hours_per_day}h/day · ${data.total_days} days</p>
    </div>
    ${days.map(d => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
        border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <span style="background:rgba(230,57,70,0.2); color:#e63946; padding:3px 8px;
            border-radius:6px; font-size:0.75rem; font-weight:700;">Day ${d.day}</span>
          <span style="color:#f0f0f8; font-size:0.88rem; font-weight:600;">${d.focus}</span>
        </div>
        <ul style="margin:0; padding-left:16px; color:#9999bb; font-size:0.8rem;">
          ${(d.tasks || []).map(t => `<li style="margin-bottom:3px;">${t}</li>`).join("")}
        </ul>
        <p style="color:#4285f4; font-size:0.78rem; margin-top:6px; margin-bottom:0;">🎯 ${d.goal}</p>
      </div>`).join("")}
    ${data.tips ? `
      <div style="background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.2);
        border-radius:10px; padding:14px; margin-top:8px;">
        <p style="color:#f59e0b; font-weight:600; font-size:0.85rem; margin-bottom:8px;">💡 Study Tips</p>
        <ul style="margin:0; padding-left:16px; color:#9999bb; font-size:0.8rem;">
          ${data.tips.map(t => `<li style="margin-bottom:4px;">${t}</li>`).join("")}
        </ul>
      </div>` : ""}
  `;
}

// ── Compare Docs ──────────────────────────────────────────────────────────────

function renderCompareSetup(body) {
  body.innerHTML = `
    <p style="color:#9999bb; font-size:0.85rem; margin-bottom:16px;">
      Upload two PDFs first, then enter their filenames to compare them.
    </p>
    <label style="color:#ccc; font-size:0.82rem; display:block; margin-bottom:6px;">Document 1 filename</label>
    <input type="text" id="doc1-input" placeholder="e.g. paper1.pdf"
      style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
      background:rgba(255,255,255,0.05); color:#f0f0f8; font-size:0.85rem; margin-bottom:12px;">
    <label style="color:#ccc; font-size:0.82rem; display:block; margin-bottom:6px;">Document 2 filename</label>
    <input type="text" id="doc2-input" placeholder="e.g. paper2.pdf"
      style="width:100%; padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);
      background:rgba(255,255,255,0.05); color:#f0f0f8; font-size:0.85rem; margin-bottom:16px;">
    <button onclick="startCompare()"
      style="width:100%; padding:12px; border-radius:10px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#f59e0b,#ef4444); color:#fff;
      font-family:Syne,sans-serif; font-weight:700; font-size:0.9rem;">
      🔍 Compare Documents
    </button>
    <div id="compare-area" style="margin-top:20px;"></div>
  `;
}

async function startCompare() {
  const doc1 = document.getElementById("doc1-input").value.trim();
  const doc2 = document.getElementById("doc2-input").value.trim();
  const area = document.getElementById("compare-area");
  if (!doc1 || !doc2) { area.innerHTML = `<p style="color:#f59e0b;">⚠️ Please enter both filenames.</p>`; return; }
  area.innerHTML = `<p style="color:#9999bb; text-align:center; padding:20px;">⏳ Comparing documents...</p>`;
  try {
    const res  = await fetch(`${RAILWAY}/compare`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ doc1, doc2, keys: getKeys() })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    area.innerHTML = `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
        border-radius:10px; padding:16px;">
        <p style="color:#9999bb; font-size:0.75rem; margin-bottom:10px;">📄 ${doc1} vs 📄 ${doc2}</p>
        <div style="color:#e0e0f0; font-size:0.88rem; line-height:1.7;">
          ${data.answer.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}
        </div>
      </div>`;
  } catch(e) {
    area.innerHTML = `<p style="color:#ef4444;">❌ ${e.message}</p>`;
  }
}

// ── Memory ────────────────────────────────────────────────────────────────────

async function renderMemory(body) {
  body.innerHTML = `<p style="color:#9999bb; text-align:center; padding:20px;">⏳ Loading session memory...</p>`;
  try {
    const sid = localStorage.getItem("saa-session-id") || "";
    const res  = await fetch(`${RAILWAY}/memory?session_id=${sid}`);
    const data = await res.json();

    const history = await fetch(`${RAILWAY}/history?session_id=${sid}&limit=10`);
    const items = await history.json();

    if (!items.length) {
      body.innerHTML = `<p style="color:#9999bb; text-align:center; padding:40px;">💾 No memory yet. Ask some questions first!</p>`;
      return;
    }
    body.innerHTML = `
      <p style="color:#9999bb; font-size:0.82rem; margin-bottom:16px;">
        🧠 The AI remembers your past questions and uses them to give better answers.
      </p>
      ${items.map(item => `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
          border-radius:10px; padding:12px; margin-bottom:10px;">
          <p style="color:#a855f7; font-size:0.8rem; font-weight:600; margin-bottom:6px;">
            ❓ ${item.question}
          </p>
          <p style="color:#9999bb; font-size:0.78rem; line-height:1.5;">
            ${(item.answer || "").slice(0, 200)}${item.answer?.length > 200 ? "..." : ""}
          </p>
          <p style="color:#55556a; font-size:0.7rem; margin-top:6px;">
            🕐 ${(item.timestamp || "").replace("T"," ").slice(0,16)} UTC
            ${item.models?.length ? ` · 🤖 ${item.models.join(", ")}` : ""}
          </p>
        </div>`).join("")}
    `;
  } catch(e) {
    body.innerHTML = `<p style="color:#ef4444;">❌ ${e.message}</p>`;
  }
}

// ── Inject memory into questions ──────────────────────────────────────────────

async function getMemoryContext() {
  try {
    const sid = localStorage.getItem("saa-session-id") || "";
    if (!sid) return "";
    const res  = await fetch(`${RAILWAY}/memory?session_id=${sid}`);
    const data = await res.json();
    return data.memory || "";
  } catch { return ""; }
}