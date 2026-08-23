"""Limits on what one authenticated account can automate.

Sign-in itself is covered in test_login_rate_limit.py. These cover what a bot
can do once it is *through* sign-in, which the login limit says nothing about.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.deps import get_current_user
from app.core.rate_limit import WRITE_LIMIT
from app.db.session import get_db
from app.main import app
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.routers import scans as scans_router
from app.routers import targets as targets_router
from app.routers.scans import MAX_ACTIVE_SCANS_PER_USER
from tests.conftest import FakeResult, FakeSession, make, passthrough_target_url

client = TestClient(app)

WRITES = WRITE_LIMIT.amount


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _as_user(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _user() -> User:
    return User(id=uuid.uuid4(), google_sub=f"sub-{uuid.uuid4()}", email="s@hit.ac.il", name="S")


# ── The schema is not published ───────────────────────────────────────────────


def test_docs_endpoints_are_not_exposed():
    """/openapi.json lists every route, admin paths included. Serving it
    unauthenticated hands a scanner the whole map for free.
    """
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, f"{path} must not be served"


def test_api_docs_are_off_unless_explicitly_enabled():
    """Off by default matters more than the toggle working: the deployed
    service sets no such variable, so the default is what production gets.
    """
    assert Settings.model_fields["enable_api_docs"].default is False


# ── One account cannot flood the scanner ──────────────────────────────────────


def test_scan_creation_is_refused_at_the_active_ceiling(monkeypatch):
    """The expensive path. Each scan is a Cloud Run Job execution that can run
    for 30 minutes and, when scan_type is "full", sends attack payloads.
    """
    user = _user()
    _as_user(user)
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([target])],
        scalar_results=[MAX_ACTIVE_SCANS_PER_USER],
    )
    monkeypatch.setattr(scans_router, "validate_target_url", passthrough_target_url)

    resp = client.post("/api/scans/", json={"target_id": str(target.id), "scan_type": "full"})

    assert resp.status_code == 429
    assert "already have" in resp.json()["detail"]


def test_the_ceiling_is_checked_before_any_network_work(monkeypatch):
    """The DNS probe in validate_target_url is outbound work the caller gets to
    trigger. A request that is already over the ceiling must not reach it.
    """
    user = _user()
    _as_user(user)
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([target])],
        scalar_results=[MAX_ACTIVE_SCANS_PER_USER],
    )

    probed = False

    async def spy(url):
        nonlocal probed
        probed = True
        return url

    monkeypatch.setattr(scans_router, "validate_target_url", spy)

    assert client.post("/api/scans/", json={"target_id": str(target.id)}).status_code == 429
    assert probed is False, "a throttled request must not cause an outbound lookup"


def test_a_scan_below_the_ceiling_is_allowed(monkeypatch):
    """The limit must not break normal use — one scan running, another allowed."""
    user = _user()
    _as_user(user)
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([target]), FakeResult([config])],
        scalar_results=[MAX_ACTIVE_SCANS_PER_USER - 1],
    )
    monkeypatch.setattr(scans_router, "validate_target_url", passthrough_target_url)

    async def fake_start(**_kwargs):
        return "projects/p/locations/l/jobs/j/executions/e1"

    monkeypatch.setattr(scans_router.scanner_job_service, "start_execution", fake_start)
    monkeypatch.setattr(scans_router, "log_audit_event", _noop_audit)

    resp = client.post("/api/scans/", json={"target_id": str(target.id)})

    assert resp.status_code == 201


async def _noop_audit(*_a, **_k):
    pass


# ── Write endpoints are rate limited per account ──────────────────────────────


def _create_target(url: str = "https://target.example") -> int:
    return client.post("/api/targets/", json={"url": url, "description": "d"}).status_code


def test_target_creation_is_rate_limited(monkeypatch):
    _as_user(_user())
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    codes = [_create_target() for _ in range(WRITES + 3)]

    assert codes[:WRITES] == [201] * WRITES, "requests within the budget must succeed"
    assert codes[WRITES:] == [429] * 3, "requests past the budget must be refused"


def test_the_write_budget_is_per_account_not_shared(monkeypatch):
    """Keyed on the user id, so a whole campus behind one NAT does not share a
    budget — and one abusive account cannot lock everyone else out.
    """
    app.dependency_overrides[get_db] = lambda: FakeSession()
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    _as_user(_user())
    for _ in range(WRITES + 3):
        _create_target()

    _as_user(_user())
    assert _create_target() == 201, "a different account has its own budget"
