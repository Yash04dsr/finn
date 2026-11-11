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


def test_companies_shape(client):
    r = client.get("/api/companies")
    assert r.status_code == 200
    d = r.json()
    assert len(d["portfolio"]) == 17
    assert len(d["adhoc"]) == 4
    assert {"ticker", "close", "change_pct"} <= set(d["portfolio"][0])


def test_company_404(client):
    r = client.get("/api/company/NOTREAL")
    assert r.status_code == 404


def test_company_shape(client):
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


def test_chat_requires_message(client):
    r = client.post("/api/chat", json={"message": ""})
    assert r.status_code == 400


def test_costs_shape(client):
    r = client.get("/api/costs")
    assert r.status_code == 200
    d = r.json()
    assert {"total_tokens", "by_tier", "by_scope_model"} <= set(d)
