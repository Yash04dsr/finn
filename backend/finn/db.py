"""SQLite persistence layer: filings, chunks (FTS5), prices, alerts, digests, cost ledger."""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import BUNDLED_DB_PATH, DB_PATH

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    category TEXT NOT NULL,
    headline TEXT NOT NULL,
    body TEXT DEFAULT '',
    source TEXT DEFAULT 'nse',
    filed_at TEXT NOT NULL,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(ticker, headline, filed_at)
);
CREATE INDEX IF NOT EXISTS idx_filings_ticker_time ON filings(ticker, filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_filings_category ON filings(category);

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    doc_type TEXT NOT NULL,          -- annual_report | transcript | results_filing
    doc_title TEXT NOT NULL,
    period TEXT DEFAULT '',          -- e.g. FY25, Q2FY26
    url TEXT DEFAULT '',
    seq INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_ticker_type ON chunks(ticker, doc_type);

CREATE TABLE IF NOT EXISTS prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS quarterly (
    ticker TEXT NOT NULL,
    period TEXT NOT NULL,            -- e.g. Q2FY26
    period_end TEXT NOT NULL,
    revenue REAL,
    ebitda REAL,
    pbt REAL,
    pat REAL,
    source TEXT DEFAULT 'screener',
    PRIMARY KEY (ticker, period)
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    kind TEXT NOT NULL,              -- announcement | volume_spike | price_move | digest
    payload TEXT NOT NULL,           -- JSON
    priority INTEGER NOT NULL,       -- 1 = highest
    why TEXT DEFAULT '',             -- explainability string
    source_key TEXT DEFAULT '',       -- stable idempotency key for pipeline reruns
    created_at TEXT DEFAULT (datetime('now')),
    read INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alerts_time ON alerts(created_at DESC);

CREATE TABLE IF NOT EXISTS digests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    rendered TEXT NOT NULL,          -- final digest payload JSON
    source_key TEXT DEFAULT '',       -- stable idempotency key for pipeline reruns
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cost_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,             -- digest | research | classifier | enrichment
    model TEXT NOT NULL,
    tier TEXT DEFAULT '',             -- fast | reasoning (model names may be identical)
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    usd_cost REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _get_conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            if (
                DB_PATH != BUNDLED_DB_PATH
                and not DB_PATH.exists()
                and BUNDLED_DB_PATH.exists()
                and (
                    os.getenv("VERCEL") == "1"
                    or os.getenv("FINN_COPY_BUNDLED_DB") == "1"
                )
            ):
                shutil.copy2(BUNDLED_DB_PATH, DB_PATH)
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.executescript(SCHEMA)
            _migrate_schema(_conn)
            _conn.commit()
    return _conn


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Apply additive migrations for databases created by earlier demo builds."""
    migrations = {
        "alerts": ("source_key", "TEXT DEFAULT ''"),
        "digests": ("source_key", "TEXT DEFAULT ''"),
        "cost_ledger": ("tier", "TEXT DEFAULT ''"),
    }
    for table, (column, ddl) in migrations.items():
        columns = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_source_key "
        "ON alerts(source_key) WHERE source_key <> ''"
    )
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_source_key "
        "ON digests(source_key) WHERE source_key <> ''"
    )


@contextmanager
def db():
    conn = _get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- filings -------------------------------------------------------------------

def upsert_filing(ticker: str, category: str, headline: str, body: str,
                  filed_at: str, source: str = "nse", is_demo: bool = False) -> bool:
    """Insert or refresh a filing. Returns True only when it was newly inserted."""
    with db() as c:
        existed = c.execute(
            "SELECT 1 FROM filings WHERE ticker=? AND headline=? AND filed_at=?",
            (ticker, headline, filed_at),
        ).fetchone() is not None
        c.execute(
            "INSERT INTO filings(ticker, category, headline, body, source, filed_at, is_demo)"
            " VALUES(?,?,?,?,?,?,?)"
            " ON CONFLICT(ticker, headline, filed_at) DO UPDATE SET"
            " category=excluded.category, body=excluded.body, source=excluded.source,"
            " is_demo=excluded.is_demo",
            (ticker, category, headline, body, source, filed_at, int(is_demo)),
        )
        return not existed


def filings_since(since_iso: str, tickers: list[str] | None = None) -> list[dict]:
    q = "SELECT * FROM filings WHERE filed_at >= ?"
    args: list = [since_iso]
    if tickers:
        q += " AND ticker IN (%s)" % ",".join("?" * len(tickers))
        args += tickers
    q += " ORDER BY filed_at DESC"
    with db() as c:
        return [dict(r) for r in c.execute(q, args)]


def recent_filings(ticker: str, limit: int = 30) -> list[dict]:
    with db() as c:
        rows = c.execute(
            "SELECT * FROM filings WHERE ticker=? ORDER BY filed_at DESC LIMIT ?", (ticker, limit)
        ).fetchall()
    return [dict(r) for r in rows]


# --- chunks / RAG ---------------------------------------------------------------

def add_chunk(ticker: str, doc_type: str, doc_title: str, period: str,
              url: str, seq: int, text: str) -> int:
    with db() as c:
        cur = c.execute(
            "INSERT INTO chunks(ticker, doc_type, doc_title, period, url, seq, text) VALUES(?,?,?,?,?,?,?)",
            (ticker, doc_type, doc_title, period, url, seq, text),
        )
        rowid = cur.lastrowid
        # Keep the external-content FTS index in sync (contentless tables need
        # explicit inserts — there is no automatic sync without triggers).
        try:
            c.execute(
                "INSERT INTO chunks_fts(rowid, ticker, doc_type, doc_title, period, url, seq, text)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (rowid, ticker, doc_type, doc_title, period, url, seq, text),
            )
        except sqlite3.OperationalError:
            pass  # FTS table not created yet; ensure_fts rebuild will catch up
        return rowid


def search_chunks(ticker: str, query: str, doc_type: str | None = None,
                  limit: int = 6) -> list[dict]:
    """FTS5 search over document chunks; falls back to LIKE when FTS index missing."""
    fts_q = _fts_escape(query)
    with db() as c:
        try:
            sql = (
                "SELECT c.id, c.ticker, c.doc_type, c.doc_title, c.period, c.url, c.seq,"
                " snippet(chunks_fts, 6, '[', ']', ' … ', 24) AS snippet, c.text"
                " FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid"
                " WHERE chunks_fts MATCH ? AND c.ticker = ?"
            )
            args: list = [fts_q, ticker]
            if doc_type:
                sql += " AND c.doc_type = ?"
                args.append(doc_type)
            sql += " ORDER BY bm25(chunks_fts) LIMIT ?"
            args.append(limit)
            rows = c.execute(sql, args).fetchall()
        except sqlite3.OperationalError:
            sql = "SELECT id, ticker, doc_type, doc_title, period, url, seq, '', text FROM chunks WHERE ticker=?"
            args = [ticker]
            if doc_type:
                sql += " AND doc_type=?"
                args.append(doc_type)
            tokens = [
                token for token in query.replace('"', " ").replace("'", " ").split()
                if len(token) >= 3
            ][:8]
            if tokens:
                sql += " AND (" + " OR ".join(
                    "(LOWER(text) LIKE ? OR LOWER(doc_title) LIKE ?)" for _ in tokens
                ) + ")"
                for token in tokens:
                    like = f"%{token.lower()}%"
                    args.extend((like, like))
            sql += " ORDER BY id LIMIT ?"
            args.append(limit)
            rows = c.execute(sql, args).fetchall()
    return [dict(r) for r in rows]


def _fts_escape(query: str) -> str:
    """Wrap each token in double quotes so punctuation never breaks MATCH syntax."""
    tokens = [t for t in query.replace('"', " ").replace("'", " ").split() if t]
    if not tokens:
        return '""'
    return " ".join(f'"{t}"' for t in tokens)


def ensure_fts() -> None:
    with db() as c:
        try:
            c.execute(
                "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5("
                "ticker, doc_type, doc_title, period, url, seq, text, content='chunks', content_rowid='id')"
            )
            c.execute("INSERT OR IGNORE INTO chunks_fts(chunks_fts) VALUES('rebuild')")
        except sqlite3.OperationalError:
            pass  # FTS5 unavailable (rare); search_chunks falls back to LIKE/scan


def chunk_count(ticker: str | None = None, doc_type: str | None = None) -> int:
    with db() as c:
        q, args = "SELECT COUNT(*) FROM chunks WHERE 1=1", []
        if ticker:
            q += " AND ticker=?"
            args.append(ticker)
        if doc_type:
            q += " AND doc_type=?"
            args.append(doc_type)
        return c.execute(q, args).fetchone()[0]


def chunks_for(ticker: str, doc_type: str | None = None, limit: int = 40) -> list[dict]:
    """All chunks for a ticker (newest id first) — the no-query fallback for
    claim mining when FTS terms don't match."""
    with db() as c:
        if doc_type:
            rows = c.execute(
                "SELECT id, ticker, doc_type, doc_title, period, url, seq, text"
                " FROM chunks WHERE ticker=? AND doc_type=? ORDER BY id DESC LIMIT ?",
                (ticker, doc_type, limit),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id, ticker, doc_type, doc_title, period, url, seq, text"
                " FROM chunks WHERE ticker=? ORDER BY id DESC LIMIT ?",
                (ticker, limit),
            ).fetchall()
    return [dict(r) for r in rows]


def retain_chunks(ticker: str, trusted_titles: set[str]) -> int:
    """Delete non-trusted document chunks for a ticker and rebuild FTS."""
    with db() as c:
        if trusted_titles:
            placeholders = ",".join("?" for _ in trusted_titles)
            args = [ticker, *sorted(trusted_titles)]
            cur = c.execute(
                f"DELETE FROM chunks WHERE ticker=? AND doc_title NOT IN ({placeholders})",
                args,
            )
        else:
            cur = c.execute("DELETE FROM chunks WHERE ticker=?", (ticker,))
        deleted = cur.rowcount
    if deleted:
        ensure_fts()
    return deleted


# --- prices ---------------------------------------------------------------------

def put_price(ticker: str, date: str, close: float, volume: float) -> None:
    with db() as c:
        c.execute(
            "INSERT OR REPLACE INTO prices(ticker, date, close, volume) VALUES(?,?,?,?)",
            (ticker, date, close, volume),
        )


def price_history(ticker: str, limit: int = 40) -> list[dict]:
    with db() as c:
        rows = c.execute(
            "SELECT date, close, volume FROM prices WHERE ticker=? ORDER BY date DESC LIMIT ?",
            (ticker, limit),
        ).fetchall()
    return [dict(r) for r in rows][::-1]  # ascending by date


# --- quarterly numbers -----------------------------------------------------------

def put_quarterly(ticker: str, rows: list[dict]) -> None:
    with db() as c:
        for r in rows:
            c.execute(
                "INSERT OR REPLACE INTO quarterly(ticker, period, period_end, revenue, ebitda, pbt, pat, source)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (ticker, r["period"], r.get("period_end", ""), r.get("revenue"),
                 r.get("ebitda"), r.get("pbt"), r.get("pat"), r.get("source", "screener")),
            )


def quarterly_series(ticker: str, limit: int = 8) -> list[dict]:
    with db() as c:
        rows = c.execute(
            "SELECT * FROM quarterly WHERE ticker=? ORDER BY period_end DESC LIMIT ?",
            (ticker, limit),
        ).fetchall()
    return [dict(r) for r in rows][::-1]  # oldest first


# --- alerts / feed ---------------------------------------------------------------

def add_alert(ticker: str, kind: str, payload: dict, priority: int, why: str = "",
              source_key: str = "") -> int:
    """Store one alert; a non-empty source_key makes repeated pipeline runs idempotent."""
    with db() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO alerts(ticker, kind, payload, priority, why, source_key)"
            " VALUES(?,?,?,?,?,?)",
            (ticker, kind, json.dumps(payload), priority, why, source_key),
        )
        if cur.rowcount:
            return cur.lastrowid
        row = c.execute("SELECT id FROM alerts WHERE source_key=?", (source_key,)).fetchone()
        return int(row["id"]) if row else 0


def alert_source_exists(source_key: str) -> bool:
    if not source_key:
        return False
    with db() as c:
        return c.execute(
            "SELECT 1 FROM alerts WHERE source_key=? LIMIT 1", (source_key,)
        ).fetchone() is not None


def feed(since_hours: int = 24, include_read: bool = False) -> list[dict]:
    with db() as c:
        if include_read:
            rows = c.execute("SELECT * FROM alerts ORDER BY priority, created_at DESC LIMIT 200").fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM alerts WHERE read=0 ORDER BY priority, created_at DESC LIMIT 200"
            ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d["payload"])
        out.append(d)
    return out


def mark_read(alert_id: int) -> None:
    with db() as c:
        c.execute("UPDATE alerts SET read=1 WHERE id=?", (alert_id,))


def mark_all_read() -> None:
    with db() as c:
        c.execute("UPDATE alerts SET read=1")


# --- digests ---------------------------------------------------------------------

def save_digest(window_start: str, window_end: str, rendered: dict,
                source_key: str = "") -> int:
    with db() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO digests(window_start, window_end, rendered, source_key)"
            " VALUES(?,?,?,?)",
            (window_start, window_end, json.dumps(rendered), source_key),
        )
        if cur.rowcount:
            return cur.lastrowid
        row = c.execute("SELECT id FROM digests WHERE source_key=?", (source_key,)).fetchone()
        return int(row["id"]) if row else 0


def latest_digest() -> dict | None:
    with db() as c:
        row = c.execute("SELECT * FROM digests ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return None
    d = dict(row)
    d["rendered"] = json.loads(d["rendered"])
    return d


# --- cost ledger ------------------------------------------------------------------

def log_cost(scope: str, model: str, prompt_tokens: int, completion_tokens: int,
             usd_cost: float = 0.0, tier: str = "") -> None:
    with db() as c:
        c.execute(
            "INSERT INTO cost_ledger(scope, model, tier, prompt_tokens, completion_tokens, usd_cost)"
            " VALUES(?,?,?,?,?,?)",
            (scope, model, tier, prompt_tokens, completion_tokens, usd_cost),
        )


def cost_summary() -> dict:
    with db() as c:
        rows = c.execute(
            "SELECT scope, model, tier, SUM(prompt_tokens) pt, SUM(completion_tokens) ct,"
            " COUNT(*) calls FROM cost_ledger GROUP BY scope, model, tier"
        ).fetchall()
        total = c.execute(
            "SELECT COALESCE(SUM(prompt_tokens+completion_tokens),0) FROM cost_ledger"
        ).fetchone()[0]
    by_row = [dict(r) for r in rows]
    # Prefer the explicitly recorded tier. Legacy rows fall back to their scope.
    tiers: dict[str, int] = {}
    for r in by_row:
        tier = r["tier"] or ("reasoning" if r["scope"] == "research" else "fast")
        tiers[tier] = tiers.get(tier, 0) + r["pt"] + r["ct"]
    return {"by_scope_model": by_row, "total_tokens": total, "by_tier": tiers}


# --- settings ----------------------------------------------------------------------

def get_setting(key: str, default: str | None = None) -> str | None:
    with db() as c:
        row = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with db() as c:
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?,?)", (key, value))


def get_json_setting(key: str, default: dict | None = None) -> dict:
    raw = get_setting(key)
    if not raw:
        return default if default is not None else {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default if default is not None else {}


def set_json_setting(key: str, value: dict) -> None:
    set_setting(key, json.dumps(value))
