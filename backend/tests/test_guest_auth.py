"""Temporary guest sign-in — the `guest.<mode>` bearer in app.core.deps.

Delete this file along with the guest block when guest access is removed.
"""

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.user import User
from tests.conftest import FakeResult, FakeSession, make

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def guest_enabled(monkeypatch):
    """Turns GUEST_MODE_ENABLED on, clearing the settings cache either side.

    `get_settings` is lru_cached, so without the clears the value would either
    not be picked up or would leak into the next test.
    """
    monkeypatch.setenv("GUEST_MODE_ENABLED", "true")
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("GUEST_MODE_ENABLED", raising=False)
    get_settings.cache_clear()


def _sign_in(token: str, session: FakeSession):
    app.dependency_overrides[get_db] = lambda: session
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})


def _expect_google_path(monkeypatch) -> list[str]:
    """Makes Google verification fail loudly and records what reached it."""
    seen: list[str] = []

    def raise_invalid(token):
        seen.append(token)
        raise deps.InvalidCredential("not an ID token")

    monkeypatch.setattr(deps, "verify_google_id_token", raise_invalid)
    return seen


# ── The switch ────────────────────────────────────────────────────────────────


def test_guest_bearer_is_inert_while_the_flag_is_off(monkeypatch):
    """Off must leave no guest path at all — the string is then just another
    bad bearer, handed to the Google verifier like any other.
    """
    seen = _expect_google_path(monkeypatch)

    resp = _sign_in("guest.admin", FakeSession())

    assert resp.status_code == 401
    assert seen == ["guest.admin"]


def test_unknown_mode_is_rejected(monkeypatch, guest_enabled):
    _expect_google_path(monkeypatch)

    assert _sign_in("guest.superadmin", FakeSession()).status_code == 401
    assert _sign_in("guest.", FakeSession()).status_code == 401


def test_guest_role_reads_the_flag_live(guest_enabled):
    assert deps.guest_role("guest.user") == "user"
    assert deps.guest_role("guest.admin") == "admin"
    assert deps.guest_role("guest.admin.trailing") is None
    assert deps.guest_role("not-a-guest-token") is None


# ── The shared guest rows ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("mode", "sub", "name", "role"),
    [
        ("user", "guest:user", "Guest", "user"),
        ("admin", "guest:admin", "Guest Admin", "admin"),
    ],
)
def test_first_guest_sign_in_creates_the_shared_row(guest_enabled, mode, sub, name, role):
    session = FakeSession(execute_results=[FakeResult([])])

    resp = _sign_in(f"guest.{mode}", session)

    assert resp.status_code == 200
    assert resp.json()["name"] == name
    assert resp.json()["role"] == role

    created = session.added[0]
    assert created.google_sub == sub
    assert created.email.endswith(".invalid")
    assert session.committed


def test_later_guests_reuse_the_same_row(guest_enabled):
    existing = make(
        User, google_sub="guest:user", email="guest@example.invalid", name="Guest", role="user"
    )
    session = FakeSession(execute_results=[FakeResult([existing])])

    resp = _sign_in("guest.user", session)

    assert resp.status_code == 200
    assert resp.json()["id"] == str(existing.id)
    assert session.added == []


def test_stored_role_cannot_escalate_a_guest(guest_enabled):
    """The token decides the role, so hand-editing `users.role` grants nothing."""
    tampered = make(
        User, google_sub="guest:user", email="guest@example.invalid", name="Guest", role="admin"
    )
    session = FakeSession(execute_results=[FakeResult([tampered])])

    resp = _sign_in("guest.user", session)

    assert resp.status_code == 200
    assert resp.json()["role"] == "user"
    assert tampered.role == "user"


# ── Role enforcement downstream ───────────────────────────────────────────────


def test_guest_user_role_is_refused_by_the_admin_console(guest_enabled):
    row = make(
        User, google_sub="guest:user", email="guest@example.invalid", name="Guest", role="user"
    )
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([row])])

    resp = client.get("/api/admin/users", headers={"Authorization": "Bearer guest.user"})

    assert resp.status_code == 403
