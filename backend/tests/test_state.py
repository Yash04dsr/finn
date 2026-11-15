"""Durable state: a fresh instance reloads what the investor saved, from a shared store."""
from __future__ import annotations

import pytest

from finn import brief, db, state
from finn.tools.ledger import EXTRACT_VERSION


class MemoryStore:
    """The same operations as the Postgres store, held in memory."""

    def __init__(self):
        self.rows: dict[tuple[str, str], dict] = {}
        self.rev = 0

    def put(self, ns: str, key: str, value: dict, ticker: str = "") -> int:
        self.rev += 1
        self.rows[(ns, key)] = {"ns": ns, "key": key, "ticker": ticker, "value": value, "rev": self.rev}
        return self.rev

    def get(self, ns: str, key: str) -> dict | None:
        row = self.rows.get((ns, key))
        return None if row is None else row["value"]

    def keys(self, ns: str, ticker: str) -> list[str]:
        return sorted(key for (namespace, key), row in self.rows.items()
                      if namespace == ns and row["ticker"] == ticker)

    def head(self) -> int:
        return self.rev

    def changes(self, since: int, namespaces: tuple[str, ...]) -> list[tuple[str, str, dict, int]]:
        rows = [row for row in self.rows.values() if row["rev"] > since and row["ns"] in namespaces]
        rows.sort(key=lambda row: row["rev"])
        return [(row["ns"], row["key"], row["value"], row["rev"]) for row in rows]


@pytest.fixture
def memory_store():
    store = MemoryStore()
    state.use_store(store)
    yield store
    state.use_store(None)


def _forget(ticker: str) -> None:
    with db.db() as c:
        c.execute("DELETE FROM verdicts WHERE ticker=?", (ticker,))
        c.execute("DELETE FROM alerts WHERE ticker=?", (ticker,))
        c.execute("DELETE FROM watchpoints WHERE ticker=?", (ticker,))
        c.execute("DELETE FROM chunks WHERE ticker=?", (ticker,))
        c.execute("DELETE FROM guidance_claims WHERE ticker=?", (ticker,))


def test_verdict_returns_after_the_local_database_is_wiped(memory_store):
    alert_id = db.add_alert(
        "DST", "announcement",
        {"category": "results", "headline": "Q2 results", "filed_at": "2026-11-15T10:00:00+00:00"},
        1, why="results", source_key="dst:verdict:1", event_at="2026-11-15T10:00:00+00:00")
    brief.set_verdict(alert_id, "changes_story", note="guidance slipped")
    assert memory_store.get("verdict", "dst:verdict:1")["verdict"] == "changes_story"

    _forget("DST")
    state.use_store(memory_store)
    assert state.sync(force=True) >= 1
    assert state.sync(force=True) == 0
    found = [row for row in brief.verdict_log(50) if row["ticker"] == "DST"]
    assert len(found) == 1
    assert found[0]["verdict"] == "changes_story"
    assert found[0]["note"] == "guidance slipped"
    assert found[0]["headline"] == "Q2 results"


def test_investor_watchpoint_survives_and_a_deleted_one_is_not_redrafted(memory_store):
    kept = brief.add_watchpoint("DSW", "EBITDA margin above 15%", "ebitda_margin", 15, 16, None, "investor")
    text = "Revenue growth 20%, as guided on the Q2FY27 call"
    gone = brief.add_watchpoint("DSW", text, "revenue_growth", 20, 20, None, "investor")
    brief.add_watchpoint("DSW", "a drafted line", "ebitda_margin", 1, 2, None, "drafted")
    brief.delete_watchpoint("DSW", gone["id"])
    assert kept["origin"] == "investor"
    assert memory_store.keys("watchpoint", "DSW")
    assert all("a drafted line" not in (memory_store.get("watchpoint", key) or {}).get("text", "")
               for key in memory_store.keys("watchpoint", "DSW"))

    _forget("DSW")
    state.use_store(memory_store)
    state.sync(force=True)
    texts = {row["text"] for row in brief.watchpoints("DSW")}
    assert "EBITDA margin above 15%" in texts
    assert text not in texts
    drafted = brief.draft_from_ledger("DSW", {"rows": [
        {"period": "Q2FY27", "kind": "revenue_growth", "band": "20%", "company_level": True},
    ]})
    assert text not in {row["text"] for row in drafted}
    assert text.lower() in state.deleted_watchpoints("DSW")


def test_thresholds_reload_and_other_settings_do_not(memory_store):
    db.set_setting("thresholds", '{"categories_watch":["results"]}')
    db.set_setting("not_durable", "nope")
    with db.db() as c:
        c.execute("DELETE FROM settings WHERE key IN ('thresholds', 'not_durable')")
    state.use_store(memory_store)
    state.sync(force=True)
    assert db.get_setting("thresholds") == '{"categories_watch":["results"]}'
    assert db.get_setting("not_durable") is None


def test_documents_and_claims_restore_onto_a_fresh_database(memory_store):
    url = "https://example.com/dsdc-q2.pdf"
    first = db.add_chunk("DSDC", "transcript", "DSDC Q2 FY26 call", "Q2FY26", url, 0,
                         "We expect revenue growth of 12% this year.")
    db.add_chunk("DSDC", "transcript", "DSDC Q2 FY26 call", "Q2FY26", url, 1, "Margin should stay near 16%.")
    with db.db() as c:
        c.execute(
            "INSERT INTO guidance_claims(ticker, doc_url, period, kind, metric, lo, hi, unit, horizon, quote,"
            " speaker, chunk_id, version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("DSDC", url, "Q2FY26", "revenue_growth", "revenue growth", 12.0, 12.0, "%", "this year",
             "revenue growth of 12% this year", "CFO", first, EXTRACT_VERSION))
    state.record_document("DSDC", url)
    state.record_claims("DSDC", url, EXTRACT_VERSION)

    _forget("DSDC")
    state.use_store(memory_store)
    assert state.restore_company("DSDC") == 1
    assert state.restore_company("DSDC") == 0
    with db.db() as c:
        chunks = c.execute("SELECT id, seq, text FROM chunks WHERE ticker='DSDC' ORDER BY seq").fetchall()
        claims = c.execute("SELECT quote, chunk_id FROM guidance_claims WHERE ticker='DSDC'").fetchall()
    assert [row["seq"] for row in chunks] == [0, 1]
    assert chunks[0]["text"].startswith("We expect revenue growth")
    assert len(claims) == 1
    assert claims[0]["quote"] == "revenue growth of 12% this year"
    assert claims[0]["chunk_id"] == chunks[0]["id"]


def test_store_off_leaves_sqlite_alone():
    state.use_store(None)
    alert_id = db.add_alert(
        "DSO", "announcement", {"category": "dividend", "headline": "Dividend", "filed_at": "2026-11-15T10:00:00+00:00"},
        3, source_key="dso:1", event_at="2026-11-15T10:00:00+00:00")
    brief.set_verdict(alert_id, "no_impact")
    assert state.sync(force=True) == 0
    assert state.restore_company("DSO") == 0
    assert not state.enabled()
