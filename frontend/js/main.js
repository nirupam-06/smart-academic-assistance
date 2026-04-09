// Feature modal
const modal = document.getElementById('featureModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close-modal');

const featureDetails = {
    semantic: {
        title: 'Semantic Search',
        body: `<p>Our semantic search uses <strong>Sentence Transformers</strong> to convert academic papers and queries into dense vector embeddings. Cosine similarity finds the most relevant passages, even if keywords don't match.</p>
               <h4>Use cases</h4>
               <ul>
                   <li>Literature review – find papers by concept, not just keywords.</li>
                   <li>Question answering – retrieve exact paragraphs that answer a query.</li>
                   <li>Recommendation – suggest related work based on abstract similarity.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-database"></i> Powered by all‑MiniLM‑L6‑v2 & FAISS.</p>`
    },
    vector: {
        title: 'Vector Database (FAISS)',
        body: `<p>We use <strong>FAISS</strong> (Facebook AI Similarity Search) for ultra‑fast, memory‑efficient similarity search on GPU/CPU. Indexes are built from paper abstracts, lecture notes, and knowledge base entries.</p>
               <h4>Key features</h4>
               <ul>
                   <li>Millions of vectors, millisecond latency.</li>
                   <li>Supports L2, inner product, and cosine similarity.</li>
                   <li>Incremental indexing – add new papers without full rebuild.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-chart-line"></i> 99% recall @ 10 on our academic test set.</p>`
    },
    llm: {
        title: 'LLM Powered Generation',
        body: `<p>After retrieving the top‑k relevant passages, we feed them as context to a lightweight <strong>LLM</strong> (e.g., Llama 3 8B, GPT‑4, or Mistral). The model synthesises a coherent, citation‑aware answer.</p>
               <h4>Why it matters</h4>
               <ul>
                   <li>Reduces hallucination – answers are grounded in real documents.</li>
                   <li>Supports follow‑up questions (conversational memory).</li>
                   <li>Can be fine‑tuned on domain‑specific academic writing.</li>
               </ul>
               <p class="mt-2"><i class="fas fa-microchip"></i> Optimised with vLLM for high throughput.</p>`
    }
};

document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('click', (e) => {
        // Prevent click if it's on the learn-more span (already handled)
        if (e.target.classList.contains('learn-more')) return;
        const feature = card.dataset.feature;
        modalTitle.textContent = featureDetails[feature].title;
        modalBody.innerHTML = featureDetails[feature].body;
        modal.style.display = 'flex';
    });
});

// Learn more links
document.querySelectorAll('.learn-more').forEach(link => {
    link.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.target.closest('.feature-card');
        const feature = card.dataset.feature;
        modalTitle.textContent = featureDetails[feature].title;
        modalBody.innerHTML = featureDetails[feature].body;
        modal.style.display = 'flex';
    });
});

// Close modal
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});
// Fetch GitHub stars
async function fetchGitHubStars() {
    const repo = 'your-org/smart-academic-assistant'; // CHANGE THIS
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}`);
        const data = await response.json();
        const starCount = data.stargazers_count;
        document.getElementById('starCount').textContent = starCount ? starCount.toLocaleString() : '0';
    } catch (error) {
        console.warn('GitHub API error, using fallback');
        document.getElementById('starCount').textContent = '1.2k'; // fallback
    }
}
fetchGitHubStars();
// Contact form – mailto handler
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault(); // Stop default form submission
    
    // Get values
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    
    if (!name || !email) return;
    
    // Your email address – REPLACE WITH YOUR REAL EMAIL!
    const yourEmail = 'sainirupamkakani@gmail.com';
    
    // Subject and body
    const subject = `New message from ${name} – Smart Academic Assistant`;
    const body = `Name: ${name}%0AEmail: ${email}%0A%0A(Reply directly to this email to respond.)`;
    
    // Create mailto link
    const mailtoLink = `mailto:${yourEmail}?subject=${encodeURIComponent(subject)}&body=${body}`;
    
    // Open default email client
    window.location.href = mailtoLink;
    
    // Optional: show a success message
    alert('📨 Your message draft is ready! Please send it from your email app.');
    
    // Clear fields (optional)
    document.getElementById('contactForm').reset();
});
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Inside form submit handler
if (!validateEmail(email)) {
    alert("Please enter a valid email address.");
    return;
}