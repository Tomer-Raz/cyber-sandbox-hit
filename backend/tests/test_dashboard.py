import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.services import finding_stats_service
from tests.conftest import FakeResult, FakeSession, make

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _override_user():
    return User(id=uuid.uuid4(), google_sub="sub-1", email="student@hit.ac.il", name="Jane")


def _row(user: User, status: str, created_at: datetime) -> tuple[Scan, ScanConfig, Target]:
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    scan = make(Scan, config_id=config.id, status=status, created_at=created_at)
    return scan, config, target


def _stub_counts(monkeypatch, counts_by_scan):
    async def fake_counts(scan_ids):
        return {
            scan_id: {**finding_stats_service.empty_counts(), **counts_by_scan.get(scan_id, {})}
            for scan_id in scan_ids
        }

    monkeypatch.setattr(finding_stats_service, "severity_counts_by_scan", fake_counts)


def test_dashboard_requires_auth():
    assert client.get("/api/dashboard").status_code == 403


def test_dashboard_is_all_zeros_without_scans(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _override_user()
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([])])
    _stub_counts(monkeypatch, {})

    body = client.get("/api/dashboard").json()

    assert body["total_scans"] == 0
    assert body["avg_risk_score"] == 0.0
    assert body["severity_totals"]["critical"] == 0
    # The chart still needs a full week of x-axis points.
    assert len(body["trend"]) == 7


def test_dashboard_aggregates_counts_and_statuses(monkeypatch):
    user = _override_user()
    now = datetime.now(timezone.utc)
    done = _row(user, "completed", now)
    active = _row(user, "running", now)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([done, active])]
    )
    _stub_counts(
        monkeypatch,
        {
            str(done[0].id): {"critical": 2, "medium": 1},
            str(active[0].id): {"low": 3},
        },
    )

    body = client.get("/api/dashboard").json()

    assert body["total_scans"] == 2
    assert body["completed_scans"] == 1
    assert body["running_scans"] == 1
    assert body["total_findings"] == 6
    assert body["critical_findings"] == 2
    assert body["severity_totals"] == {"critical": 2, "high": 0, "medium": 1, "low": 3, "info": 0}
    # Only the completed scan counts: 2 critical (25 each) + 1 medium (5).
    assert body["avg_risk_score"] == 55.0


def test_dashboard_trend_buckets_scans_by_day(monkeypatch):
    user = _override_user()
    now = datetime.now(timezone.utc)
    today = _row(user, "completed", now)
    two_days_ago = _row(user, "completed", now - timedelta(days=2))
    # Older than the 7-day window — must not appear in any bucket.
    stale = _row(user, "completed", now - timedelta(days=30))

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([today, two_days_ago, stale])]
    )
    _stub_counts(monkeypatch, {str(row[0].id): {"critical": 1} for row in (today, two_days_ago, stale)})

    trend = client.get("/api/dashboard").json()["trend"]

    assert len(trend) == 7
    assert [point["scans"] for point in trend] == [0, 0, 0, 0, 1, 0, 1]
    assert sum(point["critical"] for point in trend) == 2
