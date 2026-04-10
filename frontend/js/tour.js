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
  let cloneEl = null;

  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `
    <style>
      #tour-overlay { position:fixed;inset:0;z-index:9000;pointer-events:none; }
      #tour-blur {
        position:fixed;inset:0;
        background:rgba(0,0,0,0.75);
        backdrop-filter:blur(4px);
        -webkit-backdrop-filter:blur(4px);
        z-index:9001;pointer-events:all;
      }
      #tour-clone-wrap {
        position:fixed;z-index:9003;pointer-events:none;
        transition:all 0.35s ease;
      }
      #tour-clone-wrap .clone-ring {
        position:absolute;inset:-7px;
        border-radius:12px;
        border:2px solid #fff;
        box-shadow: 0 0 20px rgba(255,255,255,0.15);
      }
      #tour-tooltip {
        position:fixed;z-index:9003;
        background:#1a1a2e;
        border-radius:14px;
        padding:16px 18px;
        width:220px;
        pointer-events:all;
        display:none;
        transition:all 0.3s ease;
      }
      #tour-arrow-svg {
        position:fixed;inset:0;
        width:100vw;height:100vh;
        z-index:9002;pointer-events:none;
      }
      #tour-welcome {
        position:fixed;inset:0;z-index:9005;
        display:flex;align-items:center;justify-content:center;
        pointer-events:all;
      }
      .tour-box {
        background:#1a1a2e;border:1px solid rgba(255,255,255,0.12);
        border-radius:18px;padding:32px 28px;text-align:center;max-width:280px;
      }
      .tour-box h2 { color:#f0f0f8;font-size:18px;margin:10px 0 8px; }
      .tour-box p { color:#9999bb;font-size:13px;line-height:1.6;margin:0 0 20px; }
      .t-start {
        width:100%;background:#e63946;border:none;color:#fff;
        padding:12px;border-radius:10px;font-size:14px;font-weight:600;
        cursor:pointer;font-family:inherit;
      }
      .t-skip {
        background:none;border:none;color:#55556a;font-size:12px;
        cursor:pointer;margin-top:10px;font-family:inherit;
      }
      .tt-icon { font-size:22px;margin-bottom:6px; }
      .tt-title { font-size:14px;font-weight:700;margin-bottom:5px; }
      .tt-desc { font-size:12px;color:#9999bb;line-height:1.6;margin-bottom:14px; }
      .tt-footer { display:flex;align-items:center;gap:8px; }
      .tt-back {
        background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
        color:#9999bb;padding:6px 12px;border-radius:7px;font-size:12px;
        cursor:pointer;font-family:inherit;
      }
      .tt-next {
        border:none;color:#fff;padding:6px 16px;border-radius:7px;
        font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
      }
      .tt-count { font-size:11px;color:#55556a;margin-left:auto; }
      /* Force the clone and its children (icons/text) to show up */
.btn-clone {
  z-index: 9004 !important;
  background: #1a1a2e !important; /* Matches your theme */
  border-radius: 12px !important;
}

.btn-clone * {
  opacity: 1 !important;
  visibility: visible !important;
  color: white !important;
  fill: white !important; /* For SVG icons */
}

/* Creative/Fun touch: Make the ring pulse */
@keyframes pulse-ring {
  0% { transform: scale(0.98); opacity: 0.6; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.98); opacity: 0.6; }
}

#clone-ring {
  animation: pulse-ring 2s infinite ease-in-out;
  border-width: 3px !important;
}
    </style>

    <div id="tour-blur"></div>

    <div id="tour-clone-wrap" style="display:none;">
      <div class="clone-ring" id="clone-ring"></div>
    </div>

    <svg id="tour-arrow-svg" viewBox="0 0 1920 1080" preserveAspectRatio="none">
      <defs>
        <marker id="th" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path id="th-path" d="M0,0 L8,4 L0,8 Z"/>
        </marker>
      </defs>
      <path id="tour-path" fill="none" stroke-width="2.5"
            stroke-dasharray="6,4" marker-end="url(#th)"/>
    </svg>

    <div id="tour-tooltip">
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
      <div class="tour-box">
        <div style="font-size:36px;">🎓</div>
        <h2>Welcome!</h2>
        <p>Let me show you what each button does. Quick 4-step tour!</p>
        <button class="t-start" onclick="tourStart()">Start tour →</button><br>
        <button class="t-skip" onclick="tourClose()">Skip for now</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  window.tourStart = function() {
    document.getElementById('tour-welcome').style.display = 'none';
    document.getElementById('tour-tooltip').style.display = 'block';
    document.getElementById('tour-clone-wrap').style.display = 'block';
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

    const r = btn.getBoundingClientRect();

    // Position clone wrap exactly over the real button
    const wrap = document.getElementById('tour-clone-wrap');
    wrap.style.left = r.left + 'px';
    wrap.style.top = r.top + 'px';
    wrap.style.width = r.width + 'px';
    wrap.style.height = r.height + 'px';

    // Clone the button into the wrap (above blur)
    const oldClone = wrap.querySelector('.btn-clone');
    if (oldClone) oldClone.remove();
    const clone = btn.cloneNode(true);
    // Keep the original classes so the icon/layout stays intact
clone.classList.add('btn-clone'); 

// Force the clone to be visible and positioned correctly
clone.style.display = 'flex'; 
clone.style.alignItems = 'center';
clone.style.justifyContent = 'center';
clone.style.opacity = '1';
clone.style.visibility = 'visible';
    clone.removeAttribute('id');
    clone.style.cssText = btn.style.cssText;
    clone.style.position = 'absolute';
    clone.style.inset = '0';
    clone.style.width = '100%';
    clone.style.height = '100%';
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    clone.style.zIndex = '9003';
    wrap.appendChild(clone);

    // Ring color
    document.getElementById('clone-ring').style.borderColor = s.color;
    document.getElementById('clone-ring').style.boxShadow = '0 0 16px ' + s.color + '55';

    // Position tooltip
    const tt = document.getElementById('tour-tooltip');
    tt.style.border = '1px solid ' + s.color + '55';
    const ttW = 220;
    let ttLeft = r.left - ttW - 20;
    if (ttLeft < 8) ttLeft = r.right + 20;
    if (ttLeft + ttW > window.innerWidth - 8) ttLeft = r.left - ttW - 20;
    let ttTop = r.bottom + 16;
    if (ttTop + 200 > window.innerHeight) ttTop = r.top - 200;
    tt.style.left = ttLeft + 'px';
    tt.style.top = ttTop + 'px';

    // Draw arrow
    const svgEl = document.getElementById('tour-arrow-svg');
    svgEl.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);
    const p = document.getElementById('tour-path');
    const head = document.getElementById('th-path');
    p.setAttribute('stroke', s.color);
    head.setAttribute('fill', s.color);

    const startX = ttLeft + ttW / 2;
    const startY = ttTop;
    const endX = r.left + r.width / 2;
    const endY = r.top - 8;
    p.setAttribute('d', `M${startX},${startY} C${startX},${startY-40} ${endX},${endY+40} ${endX},${endY}`);

    // Content
    document.getElementById('tt-icon').textContent = s.icon;
    document.getElementById('tt-title').style.color = s.color;
    document.getElementById('tt-title').textContent = s.title;
    document.getElementById('tt-desc').textContent = s.desc;
    document.getElementById('tt-count').textContent = (i+1) + ' of ' + steps.length;
    const nb = document.getElementById('tt-next');
    nb.style.background = s.color;
    nb.textContent = i === steps.length-1 ? 'Done ✓' : 'Next →';
    document.getElementById('tt-back').style.display = i === 0 ? 'none' : '';
  }
})();
