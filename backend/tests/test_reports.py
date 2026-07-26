import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.schemas.report import ReportFinding, ScanReport
from app.services import report_service
from tests.conftest import FakeSession

client = TestClient(app)


def _override_user():
    return User(id=uuid.uuid4(), google_sub="sub-1", email="student@hit.ac.il", name="Jane")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _sample_report(**overrides) -> ScanReport:
    defaults = dict(
        scan_id=uuid.uuid4(),
        status="completed",
        target_url="https://target.example",
        scan_type="baseline",
        created_at=datetime.now(timezone.utc),
        findings=[
            ReportFinding(
                name="SQL Injection",
                risk="High",
                severity="high",
                cvss_score=8.2,
                summary="Classic SQL injection.",
                remediation="Use parameterized queries.",
            )
        ],
    )
    defaults.update(overrides)
    return ScanReport(**defaults)


def test_get_report_requires_auth():
    resp = client.get(f"/api/reports/{uuid.uuid4()}")
    assert resp.status_code == 403


def test_get_report_returns_built_report(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    report = _sample_report()

    async def fake_build(_scan_id, _user, _db):
        return report

    monkeypatch.setattr(report_service, "build_scan_report", fake_build)

    resp = client.get(f"/api/reports/{report.scan_id}")

    assert resp.status_code == 200
    assert resp.json()["target_url"] == "https://target.example"
    assert len(resp.json()["findings"]) == 1


def test_export_report_rejects_invalid_format(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    app.dependency_overrides[get_db] = lambda: FakeSession()

    async def fail_if_called(*_a, **_k):
        raise AssertionError("Should not build a report for an invalid format")

    monkeypatch.setattr(report_service, "build_scan_report", fail_if_called)

    resp = client.get(f"/api/reports/{uuid.uuid4()}/export?format=xml")

    assert resp.status_code == 400


def test_export_report_json(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    report = _sample_report()

    async def fake_build(_scan_id, _user, _db):
        return report

    monkeypatch.setattr(report_service, "build_scan_report", fake_build)

    resp = client.get(f"/api/reports/{report.scan_id}/export?format=json")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.json()["target_url"] == "https://target.example"


def test_export_report_pdf(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    app.dependency_overrides[get_db] = lambda: FakeSession()
    report = _sample_report()

    async def fake_build(_scan_id, _user, _db):
        return report

    monkeypatch.setattr(report_service, "build_scan_report", fake_build)

    resp = client.get(f"/api/reports/{report.scan_id}/export?format=pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")
