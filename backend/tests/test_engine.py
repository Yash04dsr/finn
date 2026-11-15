"""Tests for the threshold engine — 'unusual' must mean exactly what the user configured."""
from finn import db
from finn.alerts import engine


def _seed_prices(ticker: str, base_volume: float = 1_000_000, spike: float = None,
                 last_close: float = None):
    rows = []
    for i in range(25):
        close = 1000 + i * 2
        vol = base_volume
        rows.append({"date": f"2026-10-{i+1:02d}", "close": close, "volume": vol})
    if spike:
        rows[-1]["volume"] = spike
    if last_close:
        rows[-1]["close"] = last_close
    for r in rows:
        db.put_price(ticker, r["date"], r["close"], r["volume"])


def test_volume_spike_detection():
    _seed_prices("SPIKETEST", spike=3_200_000)  # ~3.2x average
    th = engine.get_thresholds()
    alerts = engine.check_price_volume("SPIKETEST", th)
    kinds = [a["kind"] for a in alerts]
    assert "volume_spike" in kinds
    vol = next(a for a in alerts if a["kind"] == "volume_spike")
    assert vol["payload"]["value"] >= 3.0
    assert vol["payload"]["threshold"] == th["volume_multiplier"]


def test_no_alert_when_calm():
    _seed_prices("VOLTEST")
    alerts = engine.check_price_volume("VOLTEST", engine.get_thresholds())
    assert alerts == []


def test_price_move_alert():
    _seed_prices("MOVETEST", last_close=1108.0)  # prev 1046 -> +5.9%... verify below
    alerts = engine.check_price_volume("MOVETEST", {**engine.get_thresholds(),
                                                    "price_move_pct": 4.0})
    move = [a for a in alerts if a["kind"] == "price_move"]
    assert len(move) == 1
    assert move[0]["payload"]["value"] >= 4.0


def test_custom_threshold_respected():
    _seed_prices("THRESHTEST", spike=2_700_000)  # ~2.7x
    strict = {**engine.get_thresholds(), "volume_multiplier": 5.0}
    assert engine.check_price_volume("THRESHTEST", strict) == []
    loose = {**engine.get_thresholds(), "volume_multiplier": 1.5}
    kinds = [a["kind"] for a in engine.check_price_volume("THRESHTEST", loose)]
    assert "volume_spike" in kinds


def test_unwatched_categories_rank_lower():
    th = {**engine.get_thresholds(), "categories_watch": ["results", "M&A",
                                                          "management_change",
                                                          "litigation"]}
    pri_unwatched, why = engine.announcement_priority("credit_rating", thresholds=th)
    assert pri_unwatched == 3
    assert "do not watch" in why
    th_watch = {**th, "categories_watch": th["categories_watch"] + ["credit_rating"]}
    pri_watch, why = engine.announcement_priority("credit_rating", thresholds=th_watch)
    assert pri_watch == 2
    assert "asked to watch" in why


def test_headline_wording_separates_signal_from_paperwork():
    th = engine.get_thresholds()
    assert engine.announcement_priority(
        "unclassified", thresholds=th, headline="Allotment of ESOP shares")[0] == 4
    assert engine.announcement_priority(
        "credit_rating", thresholds=th, headline="CRISIL reaffirms AAA/Stable")[0] >= 3
    assert engine.announcement_priority(
        "results", thresholds=th, headline="Board Meeting Intimation for approval of results")[0] == 3
    assert engine.announcement_priority(
        "results", thresholds=th, headline="Q2 FY26 results approved by the Board")[0] == 1
    assert engine.announcement_priority(
        "pledging", thresholds=th, headline="Release of shares pledged by promoter group")[0] == 3


def test_quiet_hours_logic():
    from datetime import datetime, timezone
    # Defaults are interpreted in the user's configured Asia/Kolkata timezone.
    ts_night = datetime(2026, 11, 11, 18, 0, tzinfo=timezone.utc)  # 23:30 IST
    ts_day = datetime(2026, 11, 11, 6, 30, tzinfo=timezone.utc)    # 12:00 IST
    assert engine.in_quiet_hours(ts_night) is True
    assert engine.in_quiet_hours(ts_day) is False
