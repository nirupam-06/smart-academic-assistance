"""
neo4j_db.py — Neo4j graph database layer for Smart Academic Assistant.

Graph Schema:
  (:Session {id, created_at, ip})
      -[:HAS_QA]->
  (:QA {id, question, answer, timestamp, context_used})
      -[:SOURCED_FROM]->
  (:Document {name, uploaded_at, chunk_count})

Additional:
  (:QA)-[:USED_MODEL {model_name}]->(:Model {name})
"""

import os
import uuid
from datetime import datetime
from typing import Optional

from neo4j import GraphDatabase

# ── Connection ────────────────────────────────────────────────────────────────

_driver = None

def get_driver():
    global _driver
    if _driver is None:
        uri  = os.environ.get("NEO4J_URI", "")
        user = os.environ.get("NEO4J_USER", "")
        pwd  = os.environ.get("NEO4J_PASSWORD", "")
        if not uri:
            raise ValueError("NEO4J_URI env var not set")
        print(f"Neo4j connecting to: {uri} as user: {user}")
        _driver = GraphDatabase.driver(uri, auth=(user, pwd))
    return _driver

def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None

# ── Schema / Constraints ──────────────────────────────────────────────────────

def init_schema():
    """Create constraints and indexes on first startup."""
    driver = get_driver()
    with driver.session() as session:
        session.run("CREATE CONSTRAINT qa_id IF NOT EXISTS FOR (q:QA) REQUIRE q.id IS UNIQUE")
        session.run("CREATE CONSTRAINT session_id IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE")
        session.run("CREATE CONSTRAINT doc_name IF NOT EXISTS FOR (d:Document) REQUIRE d.name IS UNIQUE")
        session.run("CREATE CONSTRAINT model_name IF NOT EXISTS FOR (m:Model) REQUIRE m.name IS UNIQUE")
        session.run("""
            CREATE FULLTEXT INDEX qa_search IF NOT EXISTS
            FOR (q:QA) ON EACH [q.question, q.answer]
        """)

# ── Session Management ────────────────────────────────────────────────────────

def get_or_create_session(session_id: Optional[str] = None, ip: str = "unknown") -> str:
    """Return existing session or create a new one. Returns session_id."""
    if not session_id:
        session_id = str(uuid.uuid4())
    driver = get_driver()
    with driver.session() as db:
        db.run("""
            MERGE (s:Session {id: $sid})
            ON CREATE SET s.created_at = $now, s.ip = $ip, s.qa_count = 0
        """, sid=session_id, now=datetime.utcnow().isoformat(), ip=ip)
    return session_id

# ── Document Tracking ─────────────────────────────────────────────────────────

def upsert_document(name: str, chunk_count: int):
    """Create or update a Document node."""
    driver = get_driver()
    with driver.session() as db:
        db.run("""
            MERGE (d:Document {name: $name})
            ON CREATE SET d.uploaded_at = $now, d.chunk_count = $chunks
            ON MATCH  SET d.last_seen   = $now, d.chunk_count = $chunks
        """, name=name, now=datetime.utcnow().isoformat(), chunks=chunk_count)

def get_documents() -> list:
    driver = get_driver()
    with driver.session() as db:
        # FIX: consume inside the session block
        return [dict(r) for r in db.run("""
            MATCH (d:Document)
            RETURN d.name AS name, d.uploaded_at AS uploaded_at, d.chunk_count AS chunks
            ORDER BY d.uploaded_at DESC
        """)]

# ── Q&A History ───────────────────────────────────────────────────────────────

def save_qa(
    question: str,
    answer: str,
    sources: list,          # may be list of dicts OR list of strings
    context_used: bool,
    individual_answers: dict,
    session_id: str,
    models_used: list = None
) -> str:
    """
    Save a Q&A interaction to Neo4j.
    Creates: (Session)-[:HAS_QA]->(QA)-[:SOURCED_FROM]->(Document)
             (QA)-[:USED_MODEL]->(Model)
    Returns the QA node id.
    """
    qa_id = str(uuid.uuid4())
    ts    = datetime.utcnow().isoformat()
    driver = get_driver()

    with driver.session() as db:
        # FIX: MERGE instead of MATCH so session is created if missing
        db.run("""
            MERGE (s:Session {id: $sid})
            ON CREATE SET s.created_at = $now, s.ip = 'unknown', s.qa_count = 0
            CREATE (q:QA {
                id:           $qa_id,
                question:     $question,
                answer:       $answer,
                timestamp:    $ts,
                context_used: $ctx,
                individual_answers: $ind
            })
            CREATE (s)-[:HAS_QA {at: $ts}]->(q)
            SET s.qa_count = coalesce(s.qa_count, 0) + 1
        """,
            sid=session_id, qa_id=qa_id,
            question=question, answer=answer, ts=ts,
            ctx=context_used, ind=str(individual_answers),
            now=ts
        )

        # Extract plain filename strings — Neo4j cannot store maps as properties
        source_names = []
        for src in sources:
            if isinstance(src, dict):
                source_names.append(src.get("file", str(src)))
            else:
                source_names.append(str(src))

        # Link QA → Documents
        for name in source_names:
            db.run("""
                MATCH (q:QA {id: $qa_id})
                MERGE (d:Document {name: $name})
                MERGE (q)-[:SOURCED_FROM]->(d)
            """, qa_id=qa_id, name=name)

        # Link QA → Models used
        if models_used:
            for model in models_used:
                db.run("""
                    MATCH (q:QA {id: $qa_id})
                    MERGE (m:Model {name: $model})
                    MERGE (q)-[:USED_MODEL]->(m)
                """, qa_id=qa_id, model=model)

    return qa_id

# ── History ───────────────────────────────────────────────────────────────────

def get_history(session_id: Optional[str] = None, limit: int = 50) -> list:
    """
    Fetch Q&A history.
    If session_id is given → return only that session's history.
    Otherwise → return latest across all sessions.
    """
    driver = get_driver()
    with driver.session() as db:
        if session_id:
            # FIX: consume inside the session block
            return [dict(r) for r in db.run("""
                MATCH (s:Session {id: $sid})-[:HAS_QA]->(q:QA)
                OPTIONAL MATCH (q)-[:SOURCED_FROM]->(d:Document)
                OPTIONAL MATCH (q)-[:USED_MODEL]->(m:Model)
                RETURN q.id AS id,
                       q.question AS question,
                       q.answer AS answer,
                       q.timestamp AS timestamp,
                       q.context_used AS context_used,
                       collect(DISTINCT d.name) AS sources,
                       collect(DISTINCT m.name) AS models
                ORDER BY q.timestamp DESC
                LIMIT $limit
            """, sid=session_id, limit=limit)]
        else:
            return [dict(r) for r in db.run("""
                MATCH (q:QA)
                OPTIONAL MATCH (q)-[:SOURCED_FROM]->(d:Document)
                OPTIONAL MATCH (q)-[:USED_MODEL]->(m:Model)
                RETURN q.id AS id,
                       q.question AS question,
                       q.answer AS answer,
                       q.timestamp AS timestamp,
                       q.context_used AS context_used,
                       collect(DISTINCT d.name) AS sources,
                       collect(DISTINCT m.name) AS models
                ORDER BY q.timestamp DESC
                LIMIT $limit
            """, limit=limit)]

def clear_history(session_id: Optional[str] = None):
    """Delete Q&A nodes. Optionally scoped to a session."""
    driver = get_driver()
    with driver.session() as db:
        if session_id:
            db.run("""
                MATCH (s:Session {id: $sid})-[:HAS_QA]->(q:QA)
                DETACH DELETE q
            """, sid=session_id)
        else:
            db.run("MATCH (q:QA) DETACH DELETE q")

# ── Analytics ─────────────────────────────────────────────────────────────────

def get_stats() -> dict:
    """Rich stats only possible with a graph DB."""
    driver = get_driver()
    with driver.session() as db:
        # FIX: consume ALL results inside the session block before returning
        counts = db.run("""
            MATCH (q:QA) WITH count(q) AS total_qa
            MATCH (s:Session) WITH total_qa, count(s) AS total_sessions
            MATCH (d:Document) WITH total_qa, total_sessions, count(d) AS total_docs
            RETURN total_qa, total_sessions, total_docs
        """).single()

        top_docs = [dict(r) for r in db.run("""
            MATCH (q:QA)-[:SOURCED_FROM]->(d:Document)
            RETURN d.name AS doc, count(q) AS queries
            ORDER BY queries DESC LIMIT 5
        """)]

        top_models = [dict(r) for r in db.run("""
            MATCH (q:QA)-[:USED_MODEL]->(m:Model)
            RETURN m.name AS model, count(q) AS uses
            ORDER BY uses DESC
        """)]

    return {
        "total_qa":        counts["total_qa"]        if counts else 0,
        "total_sessions":  counts["total_sessions"]  if counts else 0,
        "total_documents": counts["total_docs"]      if counts else 0,
        "top_documents":   top_docs,
        "model_usage":     top_models,
    }

def search_history(query: str, limit: int = 10) -> list:
    """Full-text search across all Q&A nodes."""
    driver = get_driver()
    with driver.session() as db:
        # FIX: consume inside the session block
        return [dict(r) for r in db.run("""
            CALL db.index.fulltext.queryNodes('qa_search', $query)
            YIELD node, score
            RETURN node.id AS id,
                   node.question AS question,
                   node.answer AS answer,
                   node.timestamp AS timestamp,
                   score
            ORDER BY score DESC LIMIT $limit
        """, query=query, limit=limit)]