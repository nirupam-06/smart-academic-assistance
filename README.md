# Smart Academic Assistant

A RAG-powered academic Q&A app: upload PDFs, ask questions, get grounded answers.

## Project Structure

```
smart-academic-assistant/
├── backend/
│   ├── app.py            # Flask API  (POST /ask, POST /upload, GET /status)
│   ├── embeddings.py     # Sentence-transformer wrapper (all-MiniLM-L6-v2)
│   ├── vector_store.py   # FAISS IndexFlatIP — build / search / save / load
│   ├── rag_pipeline.py   # PDF ingestion, chunking, RAG prompt assembly
│   ├── llm.py            # Ollama (default) + HuggingFace fallback
│   ├── requirements.txt  # Python dependencies
│   ├── uploads/          # Saved PDFs (auto-created)
│   └── data/             # FAISS index + metadata (auto-created)
└── frontend/
    ├── chat.html          # Chat page (IDs wired to chat-page.js)
    ├── css/
    │   ├── base.css       # CSS variables, reset
    │   └── chat.css       # Full chat UI styles
    └── js/
        └── chat-page.js   # Fetch /ask, upload PDF, typing animation
```

## Quick Start

### 1. Install Python deps
```bash
cd backend
pip install -r requirements.txt
```

### 2. Pull the LLM (Ollama — recommended)
```bash
# Install Ollama from https://ollama.com, then:
ollama pull llama3
```

### 3. Run the backend
```bash
python app.py
# → http://localhost:5000
```

### 4. Open the frontend
Open `frontend/chat.html` directly in your browser (no server needed).

## Environment Variables (optional)

| Variable        | Default                          | Description                     |
|-----------------|----------------------------------|---------------------------------|
| `LLM_BACKEND`   | `ollama`                         | `ollama` or `huggingface`       |
| `OLLAMA_MODEL`  | `llama3`                         | Any model pulled via Ollama     |
| `OLLAMA_URL`    | `http://localhost:11434`         | Ollama API base URL             |
| `HF_MODEL`      | `meta-llama/Meta-Llama-3-8B-Instruct` | HuggingFace model ID       |

## API Reference

```
POST /ask
  Body:    { "question": "What is gradient descent?" }
  Returns: { "answer": "...", "sources": ["paper.pdf"], "context_used": true }

POST /upload
  Body:    multipart/form-data, field "file" = your .pdf
  Returns: { "message": "Indexed 42 chunks from paper.pdf", "chunks": 42 }

GET /status
  Returns: { "status": "ok", "indexed_vectors": 42, "documents": ["paper.pdf"] }
```

## History API

Every Q&A is automatically saved to `data/history.db` (SQLite).

```
GET    /history   → last 50 Q&A pairs [{id, question, answer, sources, timestamp}]
DELETE /history   → clears all records
```

Use the 🕐 History button in the chat UI to view past conversations,
and the 🗑️ Trash button to clear them.
