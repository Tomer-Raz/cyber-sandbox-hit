"""The browser is told what this API may do, on every response.

The headers matter most on the responses no route produced — a 401, a 413 from
the body limit, a CORS preflight — because those are the ones a reflected or
sniffed body is most likely to ride out on. So the middleware is registered
outermost, and most of what is below is checking that placement rather than
the header strings.
"""

import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.core.body_limit import MAX_BODY_BYTES
from app.core.security_headers import SecurityHeadersMiddleware
from app.main import app

client = TestClient(app)

BASELINE = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
}


def _assert_baseline(headers) -> None:
    for name, value in BASELINE.items():
        assert headers.get(name) == value, name


# ---------------------------------------------------------------------------
# The ordinary case
# ---------------------------------------------------------------------------


def test_a_plain_response_carries_the_whole_set():
    resp = client.get("/health")

    assert resp.status_code == 200
    _assert_baseline(resp.headers)
    assert resp.headers["cache-control"] == "no-store"


def test_the_api_forbids_everything_it_could_load():
    """Nothing this service returns is a document. If a body is ever sniffed
    or reflected as HTML, `default-src 'none'` means it can still fetch,
    frame, and execute nothing.
    """
    csp = client.get("/health").headers["content-security-policy"]

    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "base-uri 'none'" in csp
    assert "form-action 'none'" in csp


def test_per_user_json_is_not_left_to_the_browsers_caching_heuristics():
    """No route sets a cache header, so without this the browser guesses — and
    a wrong guess writes one user's data to disk on a shared machine.
    """
    resp = client.get("/api/scans/")

    assert resp.status_code == 403
    assert resp.headers["cache-control"] == "no-store"


# ---------------------------------------------------------------------------
# Responses no route produced — the reason the middleware is outermost
# ---------------------------------------------------------------------------


def test_an_unauthenticated_rejection_is_still_covered():
    resp = client.get("/api/admin/users")

    # 403 rather than 401: HTTPBearer's own rejection when the header is absent.
    assert resp.status_code == 403
    _assert_baseline(resp.headers)
    assert "default-src 'none'" in resp.headers["content-security-policy"]


def test_a_404_from_no_matching_route_is_still_covered():
    resp = client.get("/definitely-not-a-route")

    assert resp.status_code == 404
    _assert_baseline(resp.headers)


def test_the_body_limits_413_is_still_covered():
    """BodySizeLimitMiddleware short-circuits before routing. It is registered
    inside this one, so its response still passes through on the way out.
    """
    resp = client.post(
        "/api/targets/",
        content=b"x" * (MAX_BODY_BYTES + 1),
        headers={"content-type": "application/json"},
    )

    assert resp.status_code == 413
    _assert_baseline(resp.headers)


def test_a_cors_preflight_is_still_covered():
    """CORSMiddleware answers OPTIONS itself and never calls the app."""
    resp = client.options(
        "/api/scans/",
        headers={
            "origin": "http://localhost:5173",
            "access-control-request-method": "GET",
        },
    )

    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    _assert_baseline(resp.headers)


# ---------------------------------------------------------------------------
# The two conditional branches, on an app small enough to see all of
# ---------------------------------------------------------------------------


@pytest.fixture
def probe() -> TestClient:
    mini = FastAPI()
    mini.add_middleware(SecurityHeadersMiddleware)

    @mini.get("/docs")
    def docs() -> Response:
        return Response("<html></html>", media_type="text/html")

    @mini.get("/data")
    def data() -> dict:
        return {"ok": True}

    @mini.get("/deliberately-cached")
    def cached() -> Response:
        return Response("{}", headers={"Cache-Control": "public, max-age=60"})

    return TestClient(mini)


def test_swagger_ui_is_exempt_from_the_csp_but_from_nothing_else(probe):
    """Swagger UI loads its script and CSS from a CDN, so `default-src 'none'`
    would serve a blank page. It is off in the deployed service, so this only
    relaxes a developer's machine — and only the CSP.
    """
    resp = probe.get("/docs")

    assert "content-security-policy" not in resp.headers
    _assert_baseline(resp.headers)


def test_a_route_that_chose_its_own_cache_policy_keeps_it(probe):
    """`no-store` is a default for routes that never thought about caching,
    not an override of one that did.
    """
    assert probe.get("/data").headers["cache-control"] == "no-store"
    assert probe.get("/deliberately-cached").headers["cache-control"] == "public, max-age=60"
