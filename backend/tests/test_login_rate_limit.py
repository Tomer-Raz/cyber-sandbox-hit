"""Sign-in rate limiting on GET /api/auth/me."""

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.core import deps, rate_limit
from app.main import app

client = TestClient(app)

LIMIT = rate_limit.LOGIN_LIMIT.amount


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _request(headers: dict[str, str], client_host: str = "10.0.0.1") -> Request:
    """A Request with the given headers, as uvicorn would hand it over."""
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (client_host, 12345),
        }
    )


# ── Which address the limit counts against ────────────────────────────────────


def test_client_ip_uses_the_last_forwarded_entry():
    """Cloud Run appends the real address, so only the last entry is honest.

    The first entry is whatever the caller put there — trusting it is what
    would let someone rotate the header to get an unlimited number of buckets.
    """
    req = _request({"X-Forwarded-For": "9.9.9.9, 203.0.113.77"})
    assert rate_limit.client_ip(req) == "203.0.113.77"


def test_client_ip_handles_a_single_entry_and_padding():
    assert rate_limit.client_ip(_request({"X-Forwarded-For": "203.0.113.77"})) == "203.0.113.77"
    assert rate_limit.client_ip(_request({"X-Forwarded-For": " 203.0.113.77 "})) == "203.0.113.77"


def test_client_ip_falls_back_to_the_socket_when_unproxied():
    """Local runs and direct container access have no forwarding header."""
    assert rate_limit.client_ip(_request({}, client_host="127.0.0.1")) == "127.0.0.1"
    assert rate_limit.client_ip(_request({"X-Forwarded-For": ""})) == "10.0.0.1"


# ── Enforcement ───────────────────────────────────────────────────────────────


def _login(xff: str) -> int:
    return client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer whatever", "X-Forwarded-For": xff},
    ).status_code


def test_login_is_limited_per_address(monkeypatch):
    monkeypatch.setattr(
        deps, "verify_google_id_token", lambda _t: (_ for _ in ()).throw(deps.InvalidCredential("no"))
    )

    codes = [_login("203.0.113.5") for _ in range(LIMIT + 5)]

    assert codes[: LIMIT] == [401] * LIMIT, "requests within the budget must reach verification"
    assert codes[LIMIT :] == [429] * 5, "requests past the budget must be refused"

    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer whatever", "X-Forwarded-For": "203.0.113.5"},
    )
    assert resp.headers["Retry-After"] == "60"
    assert "Too many sign-in attempts" in resp.json()["detail"]


def test_a_flood_from_one_address_does_not_lock_out_everyone_else(monkeypatch):
    monkeypatch.setattr(
        deps, "verify_google_id_token", lambda _t: (_ for _ in ()).throw(deps.InvalidCredential("no"))
    )

    for _ in range(LIMIT + 5):
        _login("203.0.113.5")

    assert _login("198.51.100.9") == 401, "a different address has its own budget"


def test_a_spoofed_forwarded_header_cannot_buy_a_fresh_budget(monkeypatch):
    """The attack this limit has to survive.

    uvicorn runs with `--forwarded-allow-ips='*'`, so `request.client` is set
    from the *first* X-Forwarded-For entry and is fully caller-controlled.
    Keying on that would mean a new bucket per forged value and no limit at
    all. Every request below comes from one real address with a different
    forged prefix.
    """
    monkeypatch.setattr(
        deps, "verify_google_id_token", lambda _t: (_ for _ in ()).throw(deps.InvalidCredential("no"))
    )

    codes = [_login(f"10.0.0.{i % 250}, 203.0.113.5") for i in range(LIMIT + 5)]

    assert codes[-1] == 429, "rotating the forged prefix must not reset the count"
    assert codes.count(429) == 5


# ── Ordering: the limit must run before the credential is verified ────────────


def test_the_limit_runs_before_token_verification(monkeypatch):
    """Otherwise it would be useless.

    An invalid credential is rejected inside `get_current_user`, before the
    route function runs. A limiter attached to the route function would
    therefore never see a flood of bad tokens — only successful sign-ins. This
    asserts the check happens first, by proving verification stops being
    called once the budget is spent.
    """
    calls = 0

    def counting_verify(_token):
        nonlocal calls
        calls += 1
        raise deps.InvalidCredential("bad token")

    monkeypatch.setattr(deps, "verify_google_id_token", counting_verify)

    for _ in range(LIMIT):
        _login("203.0.113.5")
    assert calls == LIMIT

    for _ in range(5):
        assert _login("203.0.113.5") == 429
    assert calls == LIMIT, "throttled requests must not reach token verification"


def test_other_routes_are_not_limited_by_the_sign_in_budget(monkeypatch):
    """The budget is scoped to sign-in, so it must not throttle the app."""
    monkeypatch.setattr(
        deps, "verify_google_id_token", lambda _t: (_ for _ in ()).throw(deps.InvalidCredential("no"))
    )

    for _ in range(LIMIT + 5):
        _login("203.0.113.5")

    for _ in range(20):
        assert client.get("/health").status_code == 200
