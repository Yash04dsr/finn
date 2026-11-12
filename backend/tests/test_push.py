"""Expo push ticket validation tests (no network requests)."""
from __future__ import annotations

import httpx

from finn import db
from finn.alerts.push import _send_expo


TOP = {
    "title": "PERSISTENT: results",
    "body": "Revenue increased.",
    "url": "/chat?ticker=PERSISTENT&filing=1",
}
TOKEN = "ExponentPushToken[test]"


class FakeResponse:
    def __init__(self, status_code: int, payload=None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def mock_client(monkeypatch, response: FakeResponse):
    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, json, headers, timeout):
            assert url == "https://exp.host/--/api/v2/push/send"
            assert json["to"] == TOKEN
            assert json["data"]["url"] == TOP["url"]
            assert headers["Accept"] == "application/json"
            assert timeout == 10
            return response

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)


async def test_send_expo_accepts_success_ticket(monkeypatch):
    mock_client(
        monkeypatch,
        FakeResponse(200, {"data": {"status": "ok", "id": "receipt-id"}}),
    )

    assert await _send_expo(TOKEN, TOP) is True


async def test_send_expo_accepts_single_ticket_array(monkeypatch):
    mock_client(
        monkeypatch,
        FakeResponse(200, {"data": [{"status": "ok", "id": "receipt-id"}]}),
    )

    assert await _send_expo(TOKEN, TOP) is True


async def test_send_expo_rejects_error_ticket_and_clears_dead_token(monkeypatch):
    db.set_setting("expo_push_token", TOKEN)
    mock_client(
        monkeypatch,
        FakeResponse(
            200,
            {
                "data": {
                    "status": "error",
                    "message": "Device is no longer registered",
                    "details": {"error": "DeviceNotRegistered"},
                }
            },
        ),
    )

    assert await _send_expo(TOKEN, TOP) is False
    assert db.get_setting("expo_push_token") == ""


async def test_send_expo_rejects_malformed_success_body(monkeypatch):
    mock_client(monkeypatch, FakeResponse(200, {"data": {"status": "ok"}}))

    assert await _send_expo(TOKEN, TOP) is False


async def test_send_expo_rejects_http_and_json_errors(monkeypatch):
    mock_client(monkeypatch, FakeResponse(503, text="temporarily unavailable"))
    assert await _send_expo(TOKEN, TOP) is False

    mock_client(monkeypatch, FakeResponse(200, ValueError("not json")))
    assert await _send_expo(TOKEN, TOP) is False
