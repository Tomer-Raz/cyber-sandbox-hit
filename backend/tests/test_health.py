from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_requires_no_auth():
    resp = client.get("/health", headers={})
    assert resp.status_code == 200
