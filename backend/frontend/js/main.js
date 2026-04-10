// main.js — feature modal

const modal      = document.getElementById('featureModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody  = document.getElementById('modalBody');
const closeBtn   = document.querySelector('.close-modal');

const details = {
  semantic: {
    title: 'Semantic Search',
    body: `<p>Uses dense vector embeddings to find conceptually relevant passages — even when exact keywords don't match. Each chunk of your PDF is converted to a 384-dimensional float32 vector and stored in FAISS.</p>
           <h4>How it works</h4>
           <ul>
             <li>PDF text is chunked at 500 characters with 50-character overlap</li>
             <li>Each chunk is embedded into a 384-dim vector</li>
             <li>FAISS inner-product search finds the closest vectors to your query</li>
           </ul>`
  },
  vector: {
    title: 'FAISS Vector Store',
    body: `<p>Facebook AI Similarity Search provides millisecond-speed retrieval over all your indexed documents. The index is saved to disk after every upload and loaded on startup — your documents persist across server restarts.</p>
           <h4>Key properties</h4>
           <ul>
             <li>IndexFlatIP — exact inner-product search</li>
             <li>Persisted: data/faiss.index + data/metadata.json</li>
             <li>Incremental: add new PDFs without rebuilding</li>
           </ul>`
  },
  llm: {
    title: 'Llama 3 Generation',
    body: `<p>The top-5 retrieved passages are formatted as context and sent to Llama 3.1 8B via Groq's free API. The model generates a grounded answer that cites the source PDF filenames.</p>
           <h4>Why Groq?</h4>
           <ul>
             <li>Free tier with generous rate limits</li>
             <li>No GPU required — runs on Railway's free plan</li>
             <li>llama-3.1-8b-instant: fast, capable, open-source</li>
           </ul>`
  }
};

if (modal && modalTitle && modalBody && closeBtn) {
  document.querySelectorAll('[data-feature]').forEach(el => {
    el.addEventListener('click', () => {
      const f = el.dataset.feature;
      if (!details[f]) return;
      modalTitle.textContent = details[f].title;
      modalBody.innerHTML    = details[f].body;
      modal.style.display    = 'flex';
    });
  });

  closeBtn.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
}
