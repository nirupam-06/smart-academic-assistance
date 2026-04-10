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
      desc: 'Add your Groq, Gemini, DeepSeek or OpenRouter API keys.',
      color: '#a855f7'
    }
  ];

  let current = 0;

  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `
    <style>
      #tour-overlay { position:fixed;inset:0;z-index:9000;pointer-events:none; }
      
      #tour-blur {
        position:fixed;inset:0;
        background:rgba(0,0,0,0.6);
        backdrop-filter:blur(3px);
        z-index:9001;
        pointer-events:all;
      }

      #tour-tooltip {
        position:fixed;z-index:9003;
        background:#1a1a2e;
        border-radius:14px;
        padding:16px 18px;
        width:220px;
        pointer-events:all;
        display:none;
      }

      #tour-welcome {
        position:fixed;inset:0;z-index:9005;
        display:flex;align-items:center;justify-content:center;
        pointer-events:all;
      }

      .tour-box {
        background:#1a1a2e;
        border:1px solid rgba(255,255,255,0.12);
        border-radius:18px;
        padding:32px 28px;
        text-align:center;
        max-width:280px;
      }

      .tour-box h2 { color:#f0f0f8;font-size:18px;margin:10px 0 8px; }
      .tour-box p { color:#9999bb;font-size:13px;line-height:1.6;margin:0 0 20px; }

      .t-start {
        width:100%;
        background:#e63946;
        border:none;
        color:#fff;
        padding:12px;
        border-radius:10px;
        cursor:pointer;
      }

      .t-skip {
        background:none;
        border:none;
        color:#55556a;
        margin-top:10px;
        cursor:pointer;
      }
    </style>

    <div id="tour-blur"></div>

    <div id="tour-tooltip">
      <div id="tt-icon"></div>
      <div id="tt-title"></div>
      <div id="tt-desc"></div>
      <button onclick="tourNext()">Next →</button>
    </div>

    <div id="tour-welcome">
      <div class="tour-box">
        <div style="font-size:36px;">🎓</div>
        <h2>Welcome!</h2>
        <p>Quick tour of your app</p>
        <button class="t-start" onclick="tourStart()">Start</button>
        <button class="t-skip" onclick="tourClose()">Skip</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function resetButtons() {
    steps.forEach(step => {
      const el = document.getElementById(step.btnId);
      if (el) {
        el.style.zIndex = '';
        el.style.outline = '';
        el.style.position = '';
      }
    });
  }

  window.tourStart = function() {
    document.getElementById('tour-welcome').style.display = 'none';
    document.getElementById('tour-tooltip').style.display = 'block';
    tourShow(0);
  };

  window.tourNext = function() {
    if (current >= steps.length - 1) {
      tourClose();
      return;
    }
    tourShow(++current);
  };

  window.tourClose = function() {
    resetButtons();
    localStorage.setItem('tour_done', '1');
    overlay.remove();
  };

  function tourShow(i) {
    resetButtons();

    current = i;
    const s = steps[i];
    const btn = document.getElementById(s.btnId);
    if (!btn) return;

    const r = btn.getBoundingClientRect();

    // 🔥 Bring REAL button above blur
    btn.style.position = 'relative';
    btn.style.zIndex = '9004';

    // 🔥 Highlight
    btn.style.outline = `3px solid ${s.color}`;
    btn.style.outlineOffset = '4px';

    // Tooltip
    const tt = document.getElementById('tour-tooltip');
    tt.style.border = `1px solid ${s.color}`;

    let left = r.right + 20;
    if (left + 220 > window.innerWidth) {
      left = r.left - 240;
    }

    let top = r.bottom + 10;
    if (top + 150 > window.innerHeight) {
      top = r.top - 160;
    }

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';

    document.getElementById('tt-icon').textContent = s.icon;
    document.getElementById('tt-title').textContent = s.title;
    document.getElementById('tt-title').style.color = s.color;
    document.getElementById('tt-desc').textContent = s.desc;
  }
})();