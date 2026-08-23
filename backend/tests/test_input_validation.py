"""Constraints on what a client is allowed to send."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.body_limit import MAX_BODY_BYTES
from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.routers import scans as scans_router
from app.routers import targets as targets_router
from tests.conftest import FakeResult, FakeSession, make, passthrough_target_url

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _user() -> User:
    return User(id=uuid.uuid4(), google_sub=f"sub-{uuid.uuid4()}", email="s@hit.ac.il", name="S")


def _signed_in() -> User:
    user = _user()
    app.dependency_overrides[get_current_user] = lambda: user
    return user


# ── Target URL is bounded ─────────────────────────────────────────────────────


def test_target_url_over_the_length_cap_is_refused(monkeypatch):
    """The column is TEXT and stores the value verbatim, so an unbounded URL is
    an unbounded row — repeatable at the write rate limit.
    """
    _signed_in()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    resp = client.post(
        "/api/targets/", json={"url": "https://a.example/" + "A" * 3000, "description": ""}
    )

    assert resp.status_code == 422


def test_target_url_cannot_be_empty(monkeypatch):
    _signed_in()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    assert client.post("/api/targets/", json={"url": ""}).status_code == 422


def test_target_description_over_the_cap_is_refused(monkeypatch):
    _signed_in()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    resp = client.post(
        "/api/targets/", json={"url": "https://a.example", "description": "d" * 501}
    )

    assert resp.status_code == 422


# ── Scan options are a fixed shape, not free-form JSON ────────────────────────


def _create_scan(monkeypatch, options) -> tuple[int, FakeSession]:
    """Posts a scan with the given options. Returns the status and the session,
    so a caller can inspect what was actually persisted.
    """
    user = _signed_in()
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    session = FakeSession(
        execute_results=[FakeResult([target]), FakeResult([config])], scalar_results=[0]
    )
    app.dependency_overrides[get_db] = lambda: session
    monkeypatch.setattr(scans_router, "validate_target_url", passthrough_target_url)

    async def fake_start(**_kwargs):
        return "projects/p/locations/l/jobs/j/executions/e1"

    async def noop_audit(*_a, **_k):
        pass

    monkeypatch.setattr(scans_router.scanner_job_service, "start_execution", fake_start)
    monkeypatch.setattr(scans_router, "log_audit_event", noop_audit)

    status = client.post(
        "/api/scans/", json={"target_id": str(target.id), "options": options}
    ).status_code
    return status, session


def test_unknown_scan_options_are_dropped_not_stored(monkeypatch):
    """`options` used to be a bare dict, so anything sent was persisted on every
    scan and nothing ever read it back. Unknown keys must not reach the row.
    """
    status, session = _create_scan(
        monkeypatch, {"activeScan": True, "junk": "x" * 1000, "nested": {"a": [1, 2]}}
    )

    assert status == 201
    stored = [o for o in session.added if isinstance(o, ScanConfig)][0].options
    assert set(stored) == {
        "activeScan",
        "ajaxSpider",
        "aiCveMatching",
        "exploitValidation",
        "maxDepth",
    }
    assert stored["activeScan"] is True


@pytest.mark.parametrize("bad_depth", [0, 21, -1])
def test_max_depth_outside_its_range_is_refused(monkeypatch, bad_depth):
    status, _ = _create_scan(monkeypatch, {"maxDepth": bad_depth})
    assert status == 422


def test_scan_type_outside_the_allowlist_is_refused():
    user = _signed_in()
    app.dependency_overrides[get_db] = lambda: FakeSession()

    resp = client.post(
        "/api/scans/", json={"target_id": str(uuid.uuid4()), "scan_type": "aggressive"}
    )

    assert resp.status_code == 422


# ── Oversized bodies are refused before anything parses them ──────────────────


def test_oversized_body_is_refused():
    """Starlette buffers the whole body before Pydantic sees a field, so a
    length cap on a field cannot prevent the memory being spent.
    """
    resp = client.post(
        "/api/targets/",
        content=b'{"url": "' + b"A" * (MAX_BODY_BYTES + 1000) + b'"}',
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 413


def test_the_body_cap_runs_before_authentication():
    """It is the outermost middleware, so an unauthenticated flood of large
    bodies is turned away without touching the auth path.
    """
    app.dependency_overrides.clear()

    resp = client.post(
        "/api/targets/",
        content=b'{"url": "' + b"A" * (MAX_BODY_BYTES + 1000) + b'"}',
        headers={"Content-Type": "application/json"},
    )

    assert resp.status_code == 413, "413 must win over the 403 for a missing token"


def test_a_normal_body_is_unaffected(monkeypatch):
    _signed_in()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    resp = client.post("/api/targets/", json={"url": "https://a.example", "description": "d"})

    assert resp.status_code == 201


# ── The correlation id is not a free text field ───────────────────────────────


def test_a_hostile_request_id_is_not_reflected():
    """It used to be echoed back verbatim, any content and any length."""
    resp = client.get("/health", headers={"X-Request-ID": "evil<script>alert(1)</script>"})

    assert resp.headers["X-Request-ID"] != "evil<script>alert(1)</script>"
    uuid.UUID(resp.headers["X-Request-ID"])  # replaced with a generated one


def test_an_overlong_request_id_is_not_reflected():
    resp = client.get("/health", headers={"X-Request-ID": "A" * 500})

    assert resp.headers["X-Request-ID"] != "A" * 500


def test_a_well_formed_request_id_is_still_honoured():
    """Tracing across the SPA and the API depends on this being passed through."""
    given = str(uuid.uuid4())

    resp = client.get("/health", headers={"X-Request-ID": given})

    assert resp.headers["X-Request-ID"] == given
