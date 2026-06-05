"""
migrate.py — Re-index all uploaded PDFs with BGE-Small embeddings.

Run this ONCE after deploying the new embedding system.
It detects the old hash-embedding index, finds all PDFs in the uploads/
directory, and rebuilds the FAISS index using BGE-Small-EN-v1.5.

Usage
─────
    cd backend/
    python migrate.py

    # Or with custom paths:
    UPLOAD_DIR=uploads DATA_DIR=data python migrate.py

What it does
────────────
1. Checks for an existing faiss.index. If it has the wrong dimension
   (dim=384 built with MD5 hashes), it archives it before overwriting.
2. Scans UPLOAD_DIR for .pdf files.
3. Re-ingests each PDF through the new pipeline (extract → chunk → encode).
4. Saves the new FAISS index and metadata.json.
5. Prints a summary.

What it does NOT do
───────────────────
- It does NOT touch Neo4j. Document nodes and Q&A history are preserved.
  Only the local FAISS vector index (chunk embeddings) is rebuilt.
- It does NOT delete uploaded PDFs.
- It is idempotent — safe to run multiple times.

Safety
──────
The old index is archived to data/faiss.index.hash_backup before being
overwritten. If anything goes wrong, restore it with:
    mv data/faiss.index.hash_backup data/faiss.index
    mv data/metadata.json.hash_backup data/metadata.json
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("migrate")

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
DATA_DIR   = os.environ.get("DATA_DIR", "data")
INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")
META_PATH  = os.path.join(DATA_DIR, "metadata.json")


def _archive_old_index() -> None:
    """Move old hash-based index files to .hash_backup before overwriting."""
    for path in (INDEX_PATH, META_PATH):
        if os.path.exists(path):
            backup = path + ".hash_backup"
            shutil.copy2(path, backup)
            logger.info("Archived %s → %s", path, backup)


def _get_pdf_files() -> list[str]:
    """Return full paths to all .pdf files in UPLOAD_DIR."""
    if not os.path.isdir(UPLOAD_DIR):
        logger.warning("Upload directory not found: %s", UPLOAD_DIR)
        return []
    return [
        os.path.join(UPLOAD_DIR, f)
        for f in sorted(os.listdir(UPLOAD_DIR))
        if f.lower().endswith(".pdf")
    ]


def main() -> None:
    logger.info("=" * 60)
    logger.info("Smart Academic Assistant — Embedding Migration")
    logger.info("Old encoder: MD5 hash (384-dim, random projection)")
    logger.info("New encoder: BAAI/bge-small-en-v1.5 (384-dim, semantic)")
    logger.info("=" * 60)

    # ── Check for stale index ──────────────────────────────────────────
    if os.path.exists(INDEX_PATH):
        import faiss
        old_index = faiss.read_index(INDEX_PATH)
        logger.info("Found existing index: dim=%d, vectors=%d", old_index.d, old_index.ntotal)
        logger.info("Archiving old index before migration...")
        _archive_old_index()
        del old_index
    else:
        logger.info("No existing index found. Starting fresh.")

    # ── Find PDFs ──────────────────────────────────────────────────────
    pdf_files = _get_pdf_files()
    if not pdf_files:
        logger.warning("No PDF files found in '%s'. Nothing to migrate.", UPLOAD_DIR)
        logger.warning("Upload PDFs first, then run this script.")
        sys.exit(0)

    logger.info("Found %d PDF file(s) to re-index:", len(pdf_files))
    for p in pdf_files:
        logger.info("  %s (%.1f KB)", os.path.basename(p), os.path.getsize(p) / 1024)

    # ── Pre-load embedding model once (avoid loading per file) ─────────
    logger.info("")
    logger.info("Loading BGE-Small-EN-v1.5 (first load may take 10-20s)...")
    t0 = time.time()
    from embeddings import warm_up
    warm_up()
    logger.info("Model loaded in %.1fs", time.time() - t0)

    # ── Clear in-memory state ──────────────────────────────────────────
    import vector_store as vs
    vs._index    = None
    vs._metadata = []

    # ── Re-index each PDF ──────────────────────────────────────────────
    logger.info("")
    from rag_pipeline import ingest_pdf

    total_chunks = 0
    success      = 0
    failures     = []

    for pdf_path in pdf_files:
        source_name = os.path.basename(pdf_path)
        try:
            t_start = time.time()
            n = ingest_pdf(pdf_path, source_name=source_name)
            elapsed = time.time() - t_start
            total_chunks += n
            success += 1
            logger.info("  ✓ %-40s  %3d chunks  %.1fs", source_name, n, elapsed)
        except Exception as exc:
            failures.append((source_name, str(exc)))
            logger.error("  ✗ %-40s  ERROR: %s", source_name, exc)

    # ── Summary ────────────────────────────────────────────────────────
    logger.info("")
    logger.info("=" * 60)
    logger.info("Migration complete.")
    logger.info("  PDFs processed:  %d / %d", success, len(pdf_files))
    logger.info("  Total chunks:    %d", total_chunks)
    logger.info("  FAISS vectors:   %d", vs._get_index().ntotal)
    if failures:
        logger.warning("  Failures (%d):", len(failures))
        for name, err in failures:
            logger.warning("    %s: %s", name, err)
    else:
        logger.info("  Failures:        0")
    logger.info("")
    logger.info("Next steps:")
    logger.info("  1. Restart your Flask app (python app.py or gunicorn)")
    logger.info("  2. Test a query — retrieval should be noticeably better")
    logger.info("  3. If something looks wrong, restore backup:")
    logger.info("     mv data/faiss.index.hash_backup data/faiss.index")
    logger.info("     mv data/metadata.json.hash_backup data/metadata.json")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
