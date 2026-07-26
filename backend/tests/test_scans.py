import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.scan import Scan
from app.models.target import Target
from app.models.user import User
from app.routers import scans as scans_router
from app.services import report_service, scanner_job_service
from app.services.scanner_job_service import ScannerJobError
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


async def _noop_audit(*_a, **_k):
    pass


@pytest.fixture(autouse=True)
def _patch_audit(monkeypatch):
    monkeypatch.setattr(scans_router, "log_audit_event", _noop_audit)


def test_list_scans_requires_auth():
    resp = client.get("/api/scans/")
    assert resp.status_code == 403


def test_create_scan_404_when_target_not_owned():
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession(execute_results=[FakeResult([])]))

    resp = client.post("/api/scans/", json={"target_id": str(uuid.uuid4()), "scan_type": "baseline"})

    assert resp.status_code == 404


def test_create_scan_400_when_target_not_approved():
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=False)
    _with_session(FakeSession(execute_results=[FakeResult([target])]))

    resp = client.post("/api/scans/", json={"target_id": str(target.id), "scan_type": "baseline"})

    assert resp.status_code == 400
    assert "not approved" in resp.json()["detail"]


def test_create_scan_400_when_target_no_longer_resolves_safely(monkeypatch):
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    _with_session(FakeSession(execute_results=[FakeResult([target])]))

    def raise_unsafe(url):
        raise scans_router.UnsafeTargetURLError("now resolves to a disallowed address")

    monkeypatch.setattr(scans_router, "validate_target_url", raise_unsafe)

    resp = client.post("/api/scans/", json={"target_id": str(target.id), "scan_type": "baseline"})

    assert resp.status_code == 400


def test_create_scan_502_and_rolls_back_when_job_fails_to_start(monkeypatch):
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    session = FakeSession(execute_results=[FakeResult([target])])
    _with_session(session)
    monkeypatch.setattr(scans_router, "validate_target_url", lambda url: url)

    async def fail_start(**_kwargs):
        raise ScannerJobError("Cloud Run unavailable")

    monkeypatch.setattr(scanner_job_service, "start_execution", fail_start)

    resp = client.post("/api/scans/", json={"target_id": str(target.id), "scan_type": "baseline"})

    assert resp.status_code == 502
    assert session.rolled_back is True


def test_create_scan_success_starts_job_and_returns_running(monkeypatch):
    user = _override_user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    _with_session(FakeSession(execute_results=[FakeResult([target])]))
    monkeypatch.setattr(scans_router, "validate_target_url", lambda url: url)

    async def fake_start(**_kwargs):
        return "projects/p/locations/l/jobs/j/executions/e1"

    monkeypatch.setattr(scanner_job_service, "start_execution", fake_start)

    resp = client.post("/api/scans/", json={"target_id": str(target.id), "scan_type": "baseline"})

    assert resp.status_code == 201
    assert resp.json()["status"] == "running"


def test_get_scan_delegates_to_owned_scan_lookup(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())
    scan = make(Scan, config_id=uuid.uuid4(), status="completed")
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)

    resp = client.get(f"/api/scans/{scan.id}")

    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


def test_get_scan_status_does_not_poll_when_terminal(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())
    scan = make(Scan, config_id=uuid.uuid4(), status="completed")
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    async def fail_if_polled(_execution_name):
        raise AssertionError("Should not poll a terminal scan")

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)
    monkeypatch.setattr(scanner_job_service, "get_execution_status", fail_if_polled)

    resp = client.get(f"/api/scans/{scan.id}/status")

    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


def test_get_scan_status_polls_and_updates_when_active(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    session = FakeSession()
    _with_session(session)
    scan = make(
        Scan, config_id=uuid.uuid4(), status="running", execution_name="projects/p/.../executions/e1"
    )
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    finished = datetime.now(timezone.utc)

    async def fake_status(_execution_name):
        return {"status": "completed", "started_at": scan.started_at, "finished_at": finished}

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)
    monkeypatch.setattr(scanner_job_service, "get_execution_status", fake_status)

    resp = client.get(f"/api/scans/{scan.id}/status")

    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert session.committed is True


def test_get_scan_report_delegates_to_report_service(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())

    async def fake_build_report(_scan_id, _user, _db):
        return report_service.ScanReport(
            scan_id=uuid.uuid4(),
            status="completed",
            target_url="https://target.example",
            scan_type="baseline",
            created_at=datetime.now(timezone.utc),
            findings=[],
        )

    monkeypatch.setattr(report_service, "build_scan_report", fake_build_report)

    resp = client.get(f"/api/scans/{uuid.uuid4()}/report")

    assert resp.status_code == 200
    assert resp.json()["target_url"] == "https://target.example"


def test_cancel_scan_409_when_already_terminal(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())
    scan = make(Scan, config_id=uuid.uuid4(), status="completed")
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)

    resp = client.delete(f"/api/scans/{scan.id}")

    assert resp.status_code == 409


def test_cancel_scan_succeeds_for_active_scan(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    session = FakeSession()
    _with_session(session)
    scan = make(
        Scan, config_id=uuid.uuid4(), status="running", execution_name="projects/p/.../executions/e1"
    )
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    cancelled = []

    async def fake_cancel(execution_name):
        cancelled.append(execution_name)

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)
    monkeypatch.setattr(scanner_job_service, "cancel_execution", fake_cancel)

    resp = client.delete(f"/api/scans/{scan.id}")

    assert resp.status_code == 204
    assert scan.status == "cancelled"
    assert cancelled == ["projects/p/.../executions/e1"]


def test_cancel_scan_502_when_cancel_fails(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    _with_session(FakeSession())
    scan = make(
        Scan, config_id=uuid.uuid4(), status="running", execution_name="projects/p/.../executions/e1"
    )
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")

    async def fake_get_owned_scan(_scan_id, _user, _db):
        return scan, target

    async def fail_cancel(_execution_name):
        raise ScannerJobError("already gone")

    monkeypatch.setattr(scans_router, "get_owned_scan", fake_get_owned_scan)
    monkeypatch.setattr(scanner_job_service, "cancel_execution", fail_cancel)

    resp = client.delete(f"/api/scans/{scan.id}")

    assert resp.status_code == 502
