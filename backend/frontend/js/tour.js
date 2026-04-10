// ── Guided Tour ───────────────────────────────────────────────────────────────
(function() {
  if (localStorage.getItem('tour_done')) return;

  const steps = [
    {
      btnId: 'upload-btn',
      icon: '📎',
      title: 'Upload a PDF',
      desc: 'Upload any academic PDF. The assistant reads it and answers questions about its content using RAG.',
      color: '#9999bb'
    },
    {
      btnId: 'history-btn',
      icon: '🕐',
      title: 'Chat history',
      desc: 'View all your previous Q&A pairs. Your conversations are saved automatically.',
      color: '#22c55e'
    },
    {
      btnId: 'clear-btn',
      icon: '🗑️',
      title: 'Clear history',
      desc: 'Delete all saved Q&A history. This cannot be undone — use with care!',
      color: '#e63946'
    },
    {
      btnId: 'ai-models-btn',
      icon: '🤖',
      title: 'AI Models sidebar',
      desc: 'Add your Groq, Gemini, DeepSeek or OpenRouter API keys. Ask all models at once and compare answers!',
      color: '#a855f7'
    }
  ];

  let current = 0;

  // ── Build overlay HTML ────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `
    <style>
      #tour-overlay {
        position: fixed;
        inset: 0;
        z-index: 9000;
        pointer-events: none;
      }
      #tour-blur {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.72);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 9001;
        pointer-events: all;
      }
      #tour-hole {
        position: fixed;
        border-radius: 10px;
        z-index: 9002;
        pointer-events: none;
        transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
        box-shadow:
          0 0 0 4px var(--hole-color),
          0 0 0 9999px rgba(0,0,0,0.0);
      }
      #tour-tooltip {
        position: fixed;
        z-index: 9003;
        background: #1a1a2e;
        border-radius: 14px;
        padding: 16px 18px;
        width: 220px;
        pointer-events: all;
        transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
      }
      #tour-arrow {
        position: fixed;
        z-index: 9003;
        pointer-events: none;
        transition: all 0.35s;
      }
      #tour-welcome {
        position: fixed;
        inset: 0;
        z-index: 9004;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: all;
      }
      .tour-welcome-box {
        background: #1a1a2e;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        padding: 32px 28px;
        text-align: center;
        max-width: 280px;
        font-family: inherit;
      }
      .tour-welcome-box h2 {
        color: #f0f0f8;
        font-size: 18px;
        margin: 10px 0 8px;
      }
      .tour-welcome-box p {
        color: #9999bb;
        font-size: 13px;
        line-height: 1.6;
        margin: 0 0 20px;
      }
      .tour-start-btn {
        width: 100%;
        background: #e63946;
        border: none;
        color: #fff;
        padding: 12px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .tour-skip-btn {
        background: none;
        border: none;
        color: #55556a;
        font-size: 12px;
        cursor: pointer;
        margin-top: 10px;
        font-family: inherit;
      }
      .tt-icon { font-size: 24px; margin-bottom: 6px; }
      .tt-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
      .tt-desc { font-size: 12px; color: #9999bb; line-height: 1.6; margin-bottom: 14px; }
      .tt-footer { display: flex; align-items: center; gap: 8px; }
      .tt-back {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        color: #9999bb; padding: 6px 12px;
        border-radius: 7px; font-size: 12px;
        cursor: pointer; font-family: inherit;
      }
      .tt-next {
        border: none; color: #fff;
        padding: 6px 16px; border-radius: 7px;
        font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: inherit;
      }
      .tt-count { font-size: 11px; color: #55556a; margin-left: auto; }
    </style>

    <div id="tour-blur"></div>
    <div id="tour-hole"></div>

    <svg id="tour-arrow" width="300" height="200">
      <defs>
        <marker id="tour-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" id="tour-arrowhead-path"/>
        </marker>
      </defs>
      <path id="tour-arrow-path" fill="none" stroke-width="2"
        stroke-dasharray="6,4" marker-end="url(#tour-arrowhead)"/>
    </svg>

    <div id="tour-tooltip" style="display:none;">
      <div class="tt-icon" id="tt-icon"></div>
      <div class="tt-title" id="tt-title"></div>
      <div class="tt-desc" id="tt-desc"></div>
      <div class="tt-footer">
        <button class="tt-back" id="tt-back" onclick="tourPrev()">← Back</button>
        <button class="tt-next" id="tt-next" onclick="tourNext()">Next →</button>
        <span class="tt-count" id="tt-count"></span>
      </div>
    </div>

    <div id="tour-welcome">
      <div class="tour-welcome-box">
        <div style="font-size:36px;">🎓</div>
        <h2>Welcome!</h2>
        <p>Let me show you what each button does. Takes just 20 seconds!</p>
        <button class="tour-start-btn" onclick="tourStart()">Start tour →</button><br>
        <button class="tour-skip-btn" onclick="tourClose()">Skip for now</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Functions ─────────────────────────────────────────────────────────────
  window.tourStart = function() {
    document.getElementById('tour-welcome').style.display = 'none';
    document.getElementById('tour-tooltip').style.display = 'block';
    tourShow(0);
  };

  window.tourNext = function() {
    if (current >= steps.length - 1) { tourClose(); return; }
    tourShow(++current);
  };

  window.tourPrev = function() {
    if (current <= 0) return;
    tourShow(--current);
  };

  window.tourClose = function() {
    localStorage.setItem('tour_done', '1');
    overlay.remove();
  };

  function tourShow(i) {
    current = i;
    const s = steps[i];
    const btn = document.getElementById(s.btnId);
    if (!btn) { tourNext(); return; }

    // Lift the button above blur
    document.querySelectorAll('.tour-lifted').forEach(el => {
      el.style.position = '';
      el.style.zIndex = '';
      el.classList.remove('tour-lifted');
    });
    btn.style.position = 'relative';
    btn.style.zIndex = '9002';
    btn.classList.add('tour-lifted');

    const r = btn.getBoundingClientRect();
    const pad = 7;

    // Position spotlight hole
    const hole = document.getElementById('tour-hole');
    hole.style.setProperty('--hole-color', s.color);
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';

    // Position tooltip below the header
    const tt = document.getElementById('tour-tooltip');
    tt.style.border = '1px solid ' + s.color + '55';
    const ttW = 220;
    const ttH = 180;
    let ttLeft = r.left - ttW - 16;
    if (ttLeft < 8) ttLeft = r.right + 16;
    let ttTop = r.bottom + 20;
    if (ttTop + ttH > window.innerHeight - 16) ttTop = r.top - ttH - 20;
    tt.style.left = ttLeft + 'px';
    tt.style.top = ttTop + 'px';

    // Draw arrow from tooltip to button
    const arrow = document.getElementById('tour-arrow');
    const arrowPath = document.getElementById('tour-arrow-path');
    const arrowHead = document.getElementById('tour-arrowhead-path');
    arrowHead.setAttribute('fill', s.color);
    arrowPath.setAttribute('stroke', s.color);

    // Arrow SVG positioned over whole screen
    arrow.style.position = 'fixed';
    arrow.style.left = '0';
    arrow.style.top = '0';
    arrow.style.width = '100vw';
    arrow.style.height = '100vh';
    arrow.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

    const startX = ttLeft + ttW / 2;
    const startY = ttTop;
    const endX = r.left + r.width / 2;
    const endY = r.bottom + pad;
    const mx = (startX + endX) / 2;
    arrowPath.setAttribute('d',
      `M${startX},${startY} C${startX},${startY - 30} ${endX},${endY - 40} ${endX},${endY}`
    );

    // Tooltip content
    document.getElementById('tt-icon').textContent = s.icon;
    document.getElementById('tt-title').style.color = s.color;
    document.getElementById('tt-title').textContent = s.title;
    document.getElementById('tt-desc').textContent = s.desc;
    document.getElementById('tt-count').textContent = (i + 1) + ' of ' + steps.length;

    const nextBtn = document.getElementById('tt-next');
    nextBtn.style.background = s.color;
    nextBtn.textContent = i === steps.length - 1 ? 'Done ✓' : 'Next →';
    document.getElementById('tt-back').style.display = i === 0 ? 'none' : '';
  }
})();
