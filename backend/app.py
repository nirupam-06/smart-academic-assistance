"""
app.py — Flask API server (Neo4j edition).

Endpoints:
  POST /ask             { question, keys, session_id? }  → { answer, sources, context_used, individual_answers, qa_id }
  POST /upload          multipart/form-data, field "file" (PDF)
  GET  /status          → health + indexed vectors + Neo4j stats
  GET  /history         → last 50 Q&A (optionally ?session_id=...)
  DELETE /history       → clear history (optionally ?session_id=...)
  GET  /history/search  → ?q=... full-text search in graph
  GET  /analytics       → graph-powered usage stats
  GET  /documents       → list all ingested documents from graph
  POST /session         → create/get session id
"""

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

import vector_store as vs
import rag_pipeline as rag
import neo4j_db as db

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXT   = {"pdf"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("data", exist_ok=True)

# Startup
vs.load()

try:
    db.init_schema()
    print("Neo4j connected and schema initialized")
except Exception as e:
    print(f"Neo4j init warning: {e}")
    print("   Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD env vars")


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT

def _get_client_ip() -> str:
    return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()


@app.route("/session", methods=["POST"])
def create_session():
    body       = request.get_json(force=True, silent=True) or {}
    session_id = body.get("session_id")
    ip         = _get_client_ip()
    sid        = db.get_or_create_session(session_id=session_id, ip=ip)
    return jsonify({"session_id": sid})


@app.route("/ask", methods=["POST"])
def ask():
    body = request.get_json(force=True, silent=True) or {}
    question   = (body.get("question") or "").strip()
    keys       = body.get("keys", {})
    session_id = body.get("session_id") or db.get_or_create_session(ip=_get_client_ip())

    if not question:
        return jsonify({"error": "question is required"}), 400

    try:
        result = rag.answer_question(question, keys)

        models_used = [k for k, v in result.get("individual_answers", {}).items()
                       if v and "error" not in v.lower()]

        qa_id = db.save_qa(
            question=question,
            answer=result.get("answer", ""),
            sources=result.get("sources", []),
            context_used=result.get("context_used", False),
            individual_answers=result.get("individual_answers", {}),
            session_id=session_id,
            models_used=models_used,
        )

        result["qa_id"]      = qa_id
        result["session_id"] = session_id
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
        db.upsert_document(name=filename, chunk_count=chunk_count)
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
    try:
        db.get_driver().verify_connectivity()
        stats    = db.get_stats()
        neo4j_ok = True
    except Exception as e:
        print(f"Neo4j status check error: {e}")
        stats    = {}
        neo4j_ok = False

    return jsonify({
        "status":          "ok",
        "neo4j_connected": neo4j_ok,
        "indexed_vectors": int(idx.ntotal),
        "documents":       list({m["source"] for m in vs._metadata}),
        "graph_stats":     stats,
    })


@app.route("/history", methods=["GET"])
def get_history():
    session_id = request.args.get("session_id")
    limit      = int(request.args.get("limit", 50))
    try:
        return jsonify(db.get_history(session_id=session_id, limit=limit))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/history", methods=["DELETE"])
def clear_history():
    session_id = request.args.get("session_id")
    try:
        db.clear_history(session_id=session_id)
        return jsonify({"message": "History cleared"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/history/search", methods=["GET"])
def search_history():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "q parameter required"}), 400
    limit = int(request.args.get("limit", 10))
    try:
        return jsonify(db.search_history(query=query, limit=limit))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/analytics", methods=["GET"])
def analytics():
    try:
        return jsonify(db.get_stats())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/documents", methods=["GET"])
def documents():
    try:
        return jsonify(db.get_documents())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def index():
    frontend = os.path.join(os.path.dirname(__file__), "frontend")
    return send_from_directory(frontend, "index.html")

@app.route("/<path:path>")
def static_files(path):
    frontend = os.path.join(os.path.dirname(__file__), "frontend")
    return send_from_directory(frontend, path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))