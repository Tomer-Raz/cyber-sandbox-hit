import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.target import Target
from app.models.user import User
from app.routers import targets as targets_router
from tests.conftest import FakeResult, FakeSession, make

client = TestClient(app)


def _override_user():
    return User(id=uuid.uuid4(), google_sub="sub-1", email="student@hit.ac.il", name="Jane")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _with_session(session: FakeSession):
    app.dependency_overrides[get_db] = lambda: session


def test_list_targets_requires_auth():
    resp = client.get("/api/targets/")
    assert resp.status_code == 403


def test_list_targets_returns_owned_targets():
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    _with_session(FakeSession(execute_results=[FakeResult([target])]))

    resp = client.get("/api/targets/")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["url"] == "https://target.example"


def test_create_target_rejects_unsafe_url(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())

    def raise_unsafe(url):
        raise targets_router.UnsafeTargetURLError("Target resolves to a disallowed address")

    monkeypatch.setattr(targets_router, "validate_target_url", raise_unsafe)

    resp = client.post("/api/targets/", json={"url": "http://169.254.169.254/", "description": ""})

    assert resp.status_code == 400


def test_create_target_auto_approves_safe_url(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())
    monkeypatch.setattr(targets_router, "validate_target_url", lambda url: url)

    resp = client.post(
        "/api/targets/", json={"url": "https://target.example", "description": "test target"}
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["approved"] is True
    assert body["url"] == "https://target.example"


def test_delete_target_returns_404_when_not_owned():
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession(execute_results=[FakeResult([])]))

    resp = client.delete(f"/api/targets/{uuid.uuid4()}")

    assert resp.status_code == 404


def test_delete_target_succeeds_when_owned():
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    session = FakeSession(execute_results=[FakeResult([target])])
    _with_session(session)

    resp = client.delete(f"/api/targets/{target.id}")

    assert resp.status_code == 204
    assert session.deleted == [target]
