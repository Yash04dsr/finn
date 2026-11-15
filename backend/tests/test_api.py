"""API contract tests using FastAPI TestClient (no live LLM calls)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from finn.api.main import app

    with TestClient(app) as c:
        yield c


def test_settings_roundtrip_api(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert "volume_multiplier" in r.json()
    r2 = client.post("/api/settings", json={"volume_multiplier": 4.0})
    assert r2.status_code == 200
    assert r2.json()["volume_multiplier"] == 4.0
    # restore
    client.post("/api/settings", json={"volume_multiplier": 2.5})


def test_health_reports_research_readiness(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert isinstance(r.json()["research_chunks"], int)
    assert isinstance(r.json()["research_ready"], bool)


def test_companies_shape(client):
    r = client.get("/api/companies")
    assert r.status_code == 200
    d = r.json()
    assert len(d["portfolio"]) == 17
    assert len(d["adhoc"]) == 4
    assert {"ticker", "close", "change_pct"} <= set(d["portfolio"][0])


def test_untracked_company_degrades_gracefully(client, monkeypatch):
    async def no_network(_ticker, **_kwargs):
        return None

    monkeypatch.setattr("finn.api.main._hydrate_company", no_network)
    r = client.get("/api/company/NOTREAL")
    assert r.status_code == 200
    assert r.json()["tracked"] is False
    assert r.json()["available"] is False


def test_company_rejects_malformed_ticker(client):
    r = client.get("/api/company/not%20a%20ticker!")
    assert r.status_code == 400


def test_company_shape(client, monkeypatch):
    async def no_network(_ticker, **_kwargs):
        return None

    monkeypatch.setattr("finn.api.main._hydrate_company", no_network)
    r = client.get("/api/company/PERSISTENT")
    assert r.status_code == 200
    d = r.json()
    assert d["ticker"] == "PERSISTENT"
    assert {"quarterly", "filings", "chunk_stats"} <= set(d)


def test_push_subscribe_expo(client):
    r = client.post("/api/push/subscribe-expo", json={"token": "ExponentPushToken[test]"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    r2 = client.post("/api/push/subscribe-expo", json={})
    assert r2.status_code == 400


def test_web_push_subscription_is_validated(client):
    valid = {
        "endpoint": "https://push.example.test/subscription",
        "keys": {"p256dh": "public-key", "auth": "auth-secret"},
    }
    assert client.post("/api/push/subscribe", json=valid).status_code == 200
    assert client.post("/api/push/subscribe", json={"endpoint": "javascript:x"}).status_code == 400


def test_chat_requires_message(client):
    r = client.post("/api/chat", json={"message": ""})
    assert r.status_code == 400


def test_chat_rejects_invalid_session_id(client):
    r = client.post("/api/chat", json={"message": "hello", "session_id": "../shared"})
    assert r.status_code == 400


def test_resolve_maps_names_and_symbols(client):
    assert client.get("/api/resolve", params={"q": "Dixon Technologies"}).json()["ticker"] == "DIXON"
    hit = client.get("/api/resolve", params={"q": "kaynes"}).json()
    assert hit["ticker"] == "KAYNES" and hit["name"].startswith("Kaynes")
    assert client.get("/api/resolve", params={"q": "the capital of France"}).status_code == 404
    assert client.get("/api/resolve", params={"q": " "}).status_code == 400


def test_chat_sends_an_unseen_ticker_to_primary_source_research(client, monkeypatch):
    import json

    async def no_network(_ticker, **_kwargs):
        return None

    fetched = []
    monkeypatch.setattr("finn.api.main._hydrate_company", no_network)
    monkeypatch.setattr("finn.ingest.discovery.ensure_research_docs",
                        lambda ticker, *a, **k: fetched.append(ticker) or {"documents": []})

    class NoModel:
        async def get_session(self, **_kwargs):
            raise RuntimeError("no model in tests")

    monkeypatch.setattr("finn.api.main.get_research_runner",
                        lambda: type("Runner", (), {"session_service": NoModel()})())
    r = client.post("/api/chat", json={"message": "What did DIXON guide for FY26?"})
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    assert events[0] == {"type": "route", "lane": "research", "ticker": "DIXON"}
    assert any(e.get("type") == "tool" and "transcript" in e.get("tool_name", "") for e in events)
    assert fetched == ["DIXON"]


def test_costs_shape(client):
    r = client.get("/api/costs")
    assert r.status_code == 200
    d = r.json()
    assert {"total_tokens", "by_tier", "by_scope_model"} <= set(d)
