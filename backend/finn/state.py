"""Durable copy of the investor's own state, for hosts whose local disk does not last.

SQLite stays the working database on every instance. What the investor creates
(verdicts and notes, watchpoints, settings, watchlist, push subscription, last look)
and the documents FINN reads for a company on demand are also written to a shared
store, and an instance loads them on start and whenever the store has moved on.

The store is Postgres when FINN_STATE_URL (or DATABASE_URL) is set; otherwise every
call here does nothing and SQLite alone holds the state.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time

log = logging.getLogger("finn.state")

# Settings that belong to the investor. VAPID keys come from the environment.
DURABLE_SETTINGS = {"thresholds", "watchlist_extra", "brief_last_look",
                    "push_subscription", "expo_push_token"}
# Small rows loaded on every sync; documents are fetched per company when needed.
SYNCED = ("setting", "watchpoint", "verdict")
RECHECK_S = 5.0


class PostgresStore:
    """One row per (namespace, key); every write takes the next revision number."""

    SCHEMA = (
        "CREATE SEQUENCE IF NOT EXISTS finn_state_rev",
        "CREATE TABLE IF NOT EXISTS finn_state (ns text NOT NULL, key text NOT NULL,"
        " ticker text NOT NULL DEFAULT '', value jsonb, rev bigint NOT NULL,"
        " updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (ns, key))",
        "CREATE INDEX IF NOT EXISTS finn_state_rev_idx ON finn_state (rev)",
        "CREATE INDEX IF NOT EXISTS finn_state_ticker_idx ON finn_state (ns, ticker)",
    )

    def __init__(self, url: str):
        self.url = url
        self._conn = None
        self._lock = threading.Lock()

    def _connect(self):
        import psycopg

        conn = psycopg.connect(self.url, autocommit=True, prepare_threshold=None, connect_timeout=10)
        for stmt in self.SCHEMA:
            conn.execute(stmt)
        return conn

    def _run(self, sql: str, args: tuple = (), fetch: bool = True):
        import psycopg

        with self._lock:
            for attempt in (1, 2):
                try:
                    if self._conn is None or self._conn.closed:
                        self._conn = self._connect()
                    cur = self._conn.execute(sql, args)
                    return cur.fetchall() if fetch else None
                except psycopg.OperationalError:
                    # Idle connections are dropped by the server; reconnect once.
                    self._conn = None
                    if attempt == 2:
                        raise

    def put(self, ns: str, key: str, value: dict, ticker: str = "") -> int:
        from psycopg.types.json import Jsonb

        rows = self._run(
            "INSERT INTO finn_state (ns, key, ticker, value, rev) VALUES (%s, %s, %s, %s, nextval('finn_state_rev'))"
            " ON CONFLICT (ns, key) DO UPDATE SET ticker=excluded.ticker, value=excluded.value,"
            " rev=excluded.rev, updated_at=now() RETURNING rev",
            (ns, key, ticker, Jsonb(value)))
        return int(rows[0][0])

    def get(self, ns: str, key: str) -> dict | None:
        rows = self._run("SELECT value FROM finn_state WHERE ns=%s AND key=%s", (ns, key))
        return rows[0][0] if rows else None

    def keys(self, ns: str, ticker: str) -> list[str]:
        return [r[0] for r in self._run(
            "SELECT key FROM finn_state WHERE ns=%s AND ticker=%s ORDER BY key", (ns, ticker))]

    def head(self) -> int:
        return int(self._run("SELECT COALESCE(MAX(rev), 0) FROM finn_state")[0][0])

    def changes(self, since: int, namespaces: tuple[str, ...]) -> list[tuple[str, str, dict, int]]:
        return [(r[0], r[1], r[2], int(r[3])) for r in self._run(
            "SELECT ns, key, value, rev FROM finn_state WHERE rev > %s AND ns = ANY(%s) ORDER BY rev",
            (since, list(namespaces)))]


_store = None
_configured = False
_rev = 0
_checked_at = 0.0
_sync_lock = threading.Lock()
_restored: set[str] = set()
_removed: dict[str, set[str]] = {}


def store():
    global _store, _configured
    if not _configured:
        _configured = True
        url = os.getenv("FINN_STATE_URL") or os.getenv("DATABASE_URL")
        if url and os.getenv("FINN_TEST_DB") != "1":
            _store = PostgresStore(url)
    return _store


def use_store(new_store) -> None:
    """Swap the store (tests pass an in-memory one; None turns the layer off)."""
    global _store, _configured, _rev, _checked_at
    _store, _configured, _rev, _checked_at = new_store, True, 0, 0.0
    _restored.clear()
    _removed.clear()


def enabled() -> bool:
    return store() is not None


def _put(ns: str, key: str, value: dict, ticker: str = "") -> None:
    s = store()
    if s is None:
        return
    try:
        s.put(ns, key, value, ticker)
    except Exception:
        log.exception("durable write failed for %s/%s", ns, key)


def watchpoint_key(ticker: str, text: str) -> str:
    return hashlib.sha256(f"{ticker}|{text.strip().lower()}".encode()).hexdigest()[:32]


# --- write-through -------------------------------------------------------------------

def record_setting(key: str, value: str) -> None:
    if key in DURABLE_SETTINGS:
        _put("setting", key, {"value": value})


def record_verdict(alert: dict, verdict: str, note: str, created_at: str) -> None:
    if not alert.get("source_key"):
        return
    snapshot = {k: alert.get(k) for k in ("ticker", "kind", "payload", "priority", "why", "event_at")}
    _put("verdict", alert["source_key"], {"ticker": alert["ticker"], "verdict": verdict, "note": note,
                                          "created_at": created_at, "alert": snapshot}, alert["ticker"])


def record_watchpoint(row: dict) -> None:
    _removed.get(row["ticker"], set()).discard(row["text"].lower())
    value = {k: row.get(k) for k in ("ticker", "text", "kind", "lo", "hi", "origin", "created_at")}
    _put("watchpoint", watchpoint_key(row["ticker"], row["text"]), value, row["ticker"])


def record_watchpoint_deleted(ticker: str, text: str) -> None:
    if not enabled():
        return
    _removed.setdefault(ticker, set()).add(text.lower())
    _put("watchpoint", watchpoint_key(ticker, text),
         {"ticker": ticker, "text": text, "deleted": True}, ticker)


def record_document(ticker: str, url: str) -> None:
    """Keep the chunks of a document read on demand, so another instance need not fetch it."""
    if not enabled():
        return
    from . import db

    with db.db() as c:
        rows = c.execute("SELECT doc_type, doc_title, period, seq, text FROM chunks WHERE ticker=? AND url=?"
                         " ORDER BY seq", (ticker, url)).fetchall()
    if not rows:
        return
    first = rows[0]
    _put("doc", url, {"ticker": ticker, "url": url, "doc_type": first["doc_type"],
                      "doc_title": first["doc_title"], "period": first["period"],
                      "chunks": [[r["seq"], r["text"]] for r in rows]}, ticker)


def record_claims(ticker: str, url: str, version: str) -> None:
    """Keep the guidance read from one call, so every build and instance grades the same claims."""
    if not enabled():
        return
    from . import db

    with db.db() as c:
        rows = [dict(r) for r in c.execute(
            "SELECT g.period, g.kind, g.metric, g.lo, g.hi, g.unit, g.horizon, g.quote, g.speaker,"
            " ch.seq AS chunk_seq FROM guidance_claims g LEFT JOIN chunks ch ON ch.id = g.chunk_id"
            " WHERE g.doc_url=? AND g.version=?", (url, version))]
    if rows:
        _put("claims", f"{version}|{url}", {"ticker": ticker, "url": url, "claims": rows}, ticker)


# --- loading -------------------------------------------------------------------------

def sync(force: bool = False) -> int:
    """Apply settings, watchpoints and verdicts written since this instance last looked."""
    global _rev, _checked_at
    s = store()
    if s is None:
        return 0
    if not force and time.monotonic() - _checked_at < RECHECK_S:
        return 0
    with _sync_lock:
        if not force and time.monotonic() - _checked_at < RECHECK_S:
            return 0
        try:
            if not force and s.head() == _rev:
                _checked_at = time.monotonic()
                return 0
            rows = s.changes(_rev, SYNCED)
        except Exception:
            log.exception("durable sync failed")
            _checked_at = time.monotonic()
            return 0
        for ns, key, value, rev in rows:
            try:
                _apply(ns, key, value or {})
            except Exception:
                log.exception("could not apply %s/%s", ns, key)
            _rev = max(_rev, rev)
        if any(ns == "setting" and key == "thresholds" for ns, key, _, _ in rows):
            from .alerts import engine

            engine.rescore_announcements()
        _checked_at = time.monotonic()
        return len(rows)


def _apply(ns: str, key: str, value: dict) -> None:
    from . import db

    with db.db() as c:
        if ns == "setting":
            c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?,?)", (key, value.get("value", "")))
        elif ns == "watchpoint":
            ticker, text = value.get("ticker", ""), value.get("text", "")
            existing = c.execute("SELECT id FROM watchpoints WHERE ticker=? AND lower(text)=lower(?)",
                                 (ticker, text)).fetchall()
            removed = _removed.setdefault(ticker, set())
            (removed.add if value.get("deleted") else removed.discard)(text.lower())
            if value.get("deleted"):
                c.execute("DELETE FROM watchpoints WHERE ticker=? AND lower(text)=lower(?)", (ticker, text))
            elif not existing:
                c.execute("INSERT INTO watchpoints(ticker, text, kind, lo, hi, origin, created_at)"
                          " VALUES(?,?,?,?,?,?,COALESCE(?, datetime('now')))",
                          (ticker, text, value.get("kind") or "", value.get("lo"), value.get("hi"),
                           value.get("origin") or "investor", value.get("created_at")))
        elif ns == "verdict":
            row = c.execute("SELECT id FROM alerts WHERE source_key=?", (key,)).fetchone()
            if row:
                alert_id = row["id"]
            else:
                # The alert is gone from this instance's feed; keep it so the decision history reads.
                a = value.get("alert") or {}
                cur = c.execute(
                    "INSERT INTO alerts(ticker, kind, payload, priority, why, source_key, event_at, read)"
                    " VALUES(?,?,?,?,?,?,?,1)",
                    (a.get("ticker") or value.get("ticker"), a.get("kind") or "announcement",
                     json.dumps(a.get("payload") or {}), int(a.get("priority") or 3), a.get("why") or "",
                     key, a.get("event_at") or ""))
                alert_id = cur.lastrowid
            c.execute("INSERT OR REPLACE INTO verdicts(alert_id, ticker, verdict, note, created_at)"
                      " VALUES(?,?,?,?,COALESCE(?, datetime('now')))",
                      (alert_id, value.get("ticker"), value.get("verdict"), value.get("note") or "",
                       value.get("created_at")))
            c.execute("UPDATE alerts SET read=1 WHERE id=?", (alert_id,))


def deleted_watchpoints(ticker: str) -> set[str]:
    """Watchpoint texts the investor removed, so drafting does not bring them back."""
    return set(_removed.get(ticker, set()))


def restore_company(ticker: str) -> int:
    """Load documents and graded guidance another instance or build already read. Once per instance."""
    s = store()
    if s is None or ticker in _restored:
        return 0
    from . import db
    from .tools.ledger import EXTRACT_VERSION

    try:
        doc_keys = s.keys("doc", ticker)
        claim_keys = s.keys("claims", ticker)
    except Exception:
        log.exception("durable lookup failed for %s", ticker)
        return 0
    _restored.add(ticker)
    with db.db() as c:
        have = {r[0] for r in c.execute("SELECT DISTINCT url FROM chunks WHERE ticker=?", (ticker,))}
    added = 0
    for url in doc_keys:
        if url in have:
            continue
        doc = s.get("doc", url)
        if not doc or not doc.get("chunks"):
            continue
        for seq, text in doc["chunks"]:
            db.add_chunk(ticker, doc["doc_type"], doc["doc_title"], doc.get("period") or "", url, int(seq), text)
        have.add(url)
        added += 1
    for key in claim_keys:
        version, _, url = key.partition("|")
        if version != EXTRACT_VERSION or url not in have:
            continue
        with db.db() as c:
            if c.execute("SELECT 1 FROM guidance_claims WHERE doc_url=? AND version=? LIMIT 1",
                         (url, version)).fetchone():
                continue
        stored = s.get("claims", key) or {}
        _insert_claims(ticker, url, version, stored.get("claims") or [])
    if added:
        db.ensure_fts()
    return added


def _insert_claims(ticker: str, url: str, version: str, claims: list[dict]) -> None:
    from . import db

    with db.db() as c:
        ids = {r["seq"]: r["id"] for r in c.execute("SELECT id, seq FROM chunks WHERE ticker=? AND url=?",
                                                     (ticker, url))}
        for cl in claims:
            c.execute(
                "INSERT INTO guidance_claims(ticker, doc_url, period, kind, metric, lo, hi, unit, horizon,"
                " quote, speaker, chunk_id, version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (ticker, url, cl.get("period") or "", cl.get("kind") or "none", cl.get("metric") or "",
                 cl.get("lo"), cl.get("hi"), cl.get("unit") or "%", cl.get("horizon") or "",
                 cl.get("quote") or "", cl.get("speaker") or "", ids.get(cl.get("chunk_seq")), version))
