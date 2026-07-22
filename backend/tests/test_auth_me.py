import uuid

from fastapi.testclient import TestClient

from app.core import deps
from app.core.deps import get_current_user
from app.main import app
from app.models.user import User

client = TestClient(app)


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
    try:
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer whatever"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == "student@hit.ac.il"
        assert body["name"] == "Jane Student"
    finally:
        app.dependency_overrides.clear()
