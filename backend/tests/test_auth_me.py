import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import User
from tests.conftest import FakeResult, FakeSession, make

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_me_requires_credentials():
    resp = client.get("/api/auth/me")
    assert resp.status_code == 403  # HTTPBearer rejects a missing Authorization header


def test_me_rejects_invalid_token(monkeypatch):
    def raise_invalid(token):
        raise deps.InvalidCredential("bad token")

    monkeypatch.setattr(deps, "verify_google_id_token", raise_invalid)

    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401


def test_me_returns_user_for_valid_token():
    fake_user = User(
        id=uuid.uuid4(),
        google_sub="1234567890",
        email="student@hit.ac.il",
        name="Jane Student",
        role="user",
    )
    app.dependency_overrides[get_current_user] = lambda: fake_user
    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "student@hit.ac.il"
    assert body["name"] == "Jane Student"


# ── Blocking and sign-in recording ────────────────────────────────────────────


def _sign_in(monkeypatch, user, *, issued_at, role="user"):
    """Drives a real `get_current_user` for `user` with a token minted then."""
    monkeypatch.setattr(
        deps,
        "verify_google_id_token",
        lambda token: {
            "sub": user.google_sub,
            "email": user.email,
            "name": user.name,
            "email_verified": True,
            "iat": int(issued_at.timestamp()),
        },
    )

    async def fake_resolve_role(claims):
        return role

    monkeypatch.setattr(deps, "resolve_role", fake_resolve_role)
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([user])])
    return client.get("/api/auth/me", headers={"Authorization": "Bearer whatever"})


def _capture_audit(monkeypatch) -> list[dict]:
    written: list[dict] = []

    async def fake_log(user_id, action, **extra):
        written.append({"user_id": user_id, "action": action, **extra})

    monkeypatch.setattr(deps.audit_service, "log_audit_event", fake_log)
    return written


def test_blocked_user_is_rejected(monkeypatch):
    user = make(User, google_sub="sub-1", email="blocked@example.com", name="Blocked", role="user")
    user.blocked_at = datetime.now(timezone.utc)
    written = _capture_audit(monkeypatch)

    resp = _sign_in(monkeypatch, user, issued_at=datetime.now(timezone.utc))

    assert resp.status_code == 403
    assert resp.json()["detail"] == "This account has been blocked by an administrator"
    # A rejected caller should leave no sign-in trail to flood the audit log.
    assert written == []


def test_sign_in_is_recorded_once_per_issued_credential(monkeypatch):
    user = make(User, google_sub="sub-2", email="student@hit.ac.il", name="Jane", role="user")
    written = _capture_audit(monkeypatch)
    issued = datetime.now(timezone.utc)

    assert _sign_in(monkeypatch, user, issued_at=issued).status_code == 200
    assert [e["action"] for e in written] == ["signed_in"]
    assert user.last_login_at is not None

    # Same credential replayed on the next API call: still one sign-in, or the
    # log would gain an entry per request rather than per session.
    assert _sign_in(monkeypatch, user, issued_at=issued).status_code == 200
    assert len(written) == 1

    # A credential Google minted later is a new sign-in.
    assert _sign_in(monkeypatch, user, issued_at=issued + timedelta(hours=2)).status_code == 200
    assert len(written) == 2


def test_sign_in_survives_a_failing_audit_log(monkeypatch):
    """The audit write is best-effort; losing it must not lock anyone out."""
    user = make(User, google_sub="sub-3", email="student@hit.ac.il", name="Jane", role="user")

    async def boom(*_args, **_kwargs):
        raise RuntimeError("firestore unavailable")

    monkeypatch.setattr(deps.audit_service, "log_audit_event", boom)

    resp = _sign_in(monkeypatch, user, issued_at=datetime.now(timezone.utc))
    assert resp.status_code == 200
