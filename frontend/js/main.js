// main.js — feature modal logic + GitHub stars

const modal      = document.getElementById('featureModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody  = document.getElementById('modalBody');
const closeBtn   = document.querySelector('.close-modal');

const featureDetails = {
    semantic: {
        title: 'Semantic Search',
        body: `<p>Our semantic search uses <strong>Sentence Transformers</strong> (all-MiniLM-L6-v2) to convert academic papers and queries into 384-dimensional dense embeddings. Inner-product similarity finds the most relevant passages — even when exact keywords don't match.</p>
               <h4>Use cases</h4>
               <ul>
                   <li>Literature review — find papers by concept, not just keywords.</li>
                   <li>Question answering — retrieve exact paragraphs that answer a query.</li>
                   <li>Recommendation — suggest related work based on abstract similarity.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-database"></i> Powered by all-MiniLM-L6-v2 & FAISS.</p>`
    },
    vector: {
        title: 'Vector Database (FAISS)',
        body: `<p>We use <strong>FAISS</strong> (Facebook AI Similarity Search) with a flat inner-product index for ultra-fast, memory-efficient similarity search. Indexes are built from PDF chunks and saved to disk — surviving server restarts.</p>
               <h4>Key features</h4>
               <ul>
                   <li>Sub-20ms search latency.</li>
                   <li>Persisted to disk — survives Railway redeploys.</li>
                   <li>Incremental: add new PDFs without rebuilding the full index.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-chart-line"></i> 95% recall@10 on benchmark test sets.</p>`
    },
    llm: {
        title: 'LLM Powered Generation',
        body: `<p>After retrieving the top-5 relevant passages, they are passed as context to <strong>Llama 3.1 8B</strong> via the Groq API. The model synthesises a coherent, citation-aware answer grounded in your documents.</p>
               <h4>Why it matters</h4>
               <ul>
                   <li>Reduces hallucination — answers cite real document passages.</li>
                   <li>Supports follow-up questions in the same session.</li>
                   <li>Groq provides free, fast inference — no GPU needed.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-microchip"></i> Model: llama-3.1-8b-instant via Groq API.</p>`
    }
};

if (modal && modalTitle && modalBody && closeBtn) {
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('learn-more')) return;
            const feature = card.dataset.feature;
            if (!featureDetails[feature]) return;
            modalTitle.textContent = featureDetails[feature].title;
            modalBody.innerHTML    = featureDetails[feature].body;
            modal.style.display    = 'flex';
        });
    });

    document.querySelectorAll('.learn-more').forEach(link => {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            const card    = e.target.closest('.feature-card');
            const feature = card && card.dataset.feature;
            if (!feature || !featureDetails[feature]) return;
            modalTitle.textContent = featureDetails[feature].title;
            modalBody.innerHTML    = featureDetails[feature].body;
            modal.style.display    = 'flex';
        });
    });

    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
}

// GitHub stars
async function fetchGitHubStars() {
    const el = document.getElementById('starCount');
    if (!el) return;
    try {
        const r = await fetch('https://api.github.com/repos/nirupam-06/smart-academic-assistance');
        const d = await r.json();
        el.textContent = d.stargazers_count != null ? d.stargazers_count.toLocaleString() : '0';
    } catch { el.textContent = '0'; }
}
fetchGitHubStars();
