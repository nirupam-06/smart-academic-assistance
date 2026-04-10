"""
app.py — Flask API server.
Endpoints:
  POST /ask        { "question": "..." }  → { "answer", "sources", "context_used" }
  POST /upload     multipart/form-data, field "file" (PDF)
  GET  /status     → health check + indexed doc count
  GET  /history    → last 50 Q&A pairs
  DELETE /history  → clear all history
"""

import os, sqlite3, json
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import vector_store as vs
import rag_pipeline as rag

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXT   = {"pdf"}
DB_PATH       = "data/history.db"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("data", exist_ok=True)

vs.load()


# ── SQLite history ─────────────────────────────────────────────────────────────

def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _init_db():
    with _get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                question  TEXT    NOT NULL,
                answer    TEXT    NOT NULL,
                sources   TEXT    NOT NULL DEFAULT '[]',
                timestamp TEXT    NOT NULL
            )
        """)
        conn.commit()

_init_db()


def _save_history(question: str, answer: str, sources: list):
    with _get_db() as conn:
        conn.execute(
            "INSERT INTO history (question, answer, sources, timestamp) VALUES (?,?,?,?)",
            (question, answer, json.dumps(sources), datetime.utcnow().isoformat())
        )
        conn.commit()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/ask", methods=["POST"])
def ask():
    body     = request.get_json(force=True, silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400
    try:
        result = rag.answer_question(question)
        _save_history(question, result["answer"], result.get("sources", []))
        return jsonify(result)
    except Exception as e:
        app.logger.exception("Error in /ask")
        return jsonify({"error": str(e)}), 500


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "no file field"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "empty filename"}), 400
    if not _allowed(file.filename):
        return jsonify({"error": "only PDF files allowed"}), 400

    filename  = secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    try:
        chunk_count = rag.ingest_pdf(save_path, source_name=filename)
        return jsonify({
            "message": f"Indexed {chunk_count} chunks from {filename}",
            "chunks":  chunk_count,
            "source":  filename,
        })
    except Exception as e:
        app.logger.exception("Error in /upload")
        return jsonify({"error": str(e)}), 500


@app.route("/status", methods=["GET"])
def status():
    idx = vs._get_index()
    return jsonify({
        "status":          "ok",
        "indexed_vectors": int(idx.ntotal),
        "documents":       list({m["source"] for m in vs._metadata}),
    })


@app.route("/history", methods=["GET"])
def get_history():
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT id, question, answer, sources, timestamp FROM history ORDER BY id DESC LIMIT 50"
        ).fetchall()
    return jsonify([{
        "id":        r["id"],
        "question":  r["question"],
        "answer":    r["answer"],
        "sources":   json.loads(r["sources"]),
        "timestamp": r["timestamp"],
    } for r in rows])


@app.route("/history", methods=["DELETE"])
def clear_history():
    with _get_db() as conn:
        conn.execute("DELETE FROM history")
        conn.commit()
    return jsonify({"message": "History cleared"})


if __name__ == "__main__":
   app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
