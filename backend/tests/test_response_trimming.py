"""Responses carry what the client renders, and no more — decided server-side.

The expensive case is the scan status endpoint. The SPA polls it every 1.5s, and
it used to return the whole execution log every time, so both the payload and the
number of Firestore documents read per poll grew with the length of the scan
being watched. It takes a cursor now.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.scan import Scan
from app.models.target import Target
from app.models.user import User
from app.routers import admin as admin_router
from app.routers import scans as scans_router
from app.schemas.scan import ScanOut
from app.services import log_service, report_service
from tests.conftest import FakeFirestoreClient, FakeResult, FakeSession, make

client = TestClient(app)

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def _user() -> User:
    return User(id=uuid.uuid4(), google_sub="sub-1", email="student@hit.ac.il", name="Jane")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Fields that were sent but never rendered
# ---------------------------------------------------------------------------


def test_scan_out_does_not_expose_internal_join_keys_or_dead_columns():
    """`config_id` is the scan_configs primary key and `error_message` is a
    column nothing ever writes. Both went over the wire; the SPA's adapter
    dropped both on arrival.
    """
    fields = set(ScanOut.model_fields)

    assert "config_id" not in fields
    assert "error_message" not in fields
    # Still there — these are rendered.
    assert {"status", "target_url", "counts", "risk_score", "region"} <= fields


def test_admin_activity_details_are_an_allowlist_not_a_passthrough(monkeypatch):
    """`log_audit_event(**extra)` accepts arbitrary keys, so the console used to
    echo whatever happened to be on the Firestore document.
    """
    event = {
        "action": "scan_started",
        "timestamp": T0,
        "user_id": "u-1",
        "scan_id": "s-1",
        "internal_note": "should not reach the client",
        "session_token": "neither should this",
    }

    parsed = admin_router._to_activity_event(event)

    assert parsed.details == {"scan_id": "s-1"}
    assert "internal_note" not in parsed.details
    assert "session_token" not in parsed.details


# ---------------------------------------------------------------------------
# The status cursor
# ---------------------------------------------------------------------------


def _worker_row(offset_seconds: int, message: str) -> dict:
    return {
        "timestamp": T0 + timedelta(seconds=offset_seconds),
        "event_type": "spider_progress",
        "message": message,
        "level": "info",
    }


@pytest.mark.asyncio
async def test_scan_events_without_a_cursor_returns_the_whole_trail(monkeypatch):
    audit = [{"timestamp": T0, "action": "scan_started"}]
    monkeypatch.setattr(
        report_service, "get_firestore_client", lambda: FakeFirestoreClient(docs=audit)
    )

    seen = {}

    async def fake_logs(scan_id, after=None):
        seen["after"] = after
        return [_worker_row(1, "Crawling 20%"), _worker_row(2, "Crawling 60%")]

    monkeypatch.setattr(log_service, "get_scan_logs", fake_logs)

    events = await report_service.scan_events(Scan(id=uuid.uuid4(), config_id=uuid.uuid4()))

    assert seen["after"] is None
    assert [e.message for e in events] == ["scan started", "Crawling 20%", "Crawling 60%"]


@pytest.mark.asyncio
async def test_scan_events_with_a_cursor_drops_what_the_caller_already_has(monkeypatch):
    """The worker log is narrowed in the Firestore query — that's the read the
    cursor exists to shrink. The handful of audit rows are filtered in memory so
    the interleave still needs no extra composite index.
    """
    audit = [
        {"timestamp": T0, "action": "scan_started"},
        {"timestamp": T0 + timedelta(seconds=10), "action": "scan_cancelled"},
    ]
    monkeypatch.setattr(
        report_service, "get_firestore_client", lambda: FakeFirestoreClient(docs=audit)
    )

    seen = {}

    async def fake_logs(scan_id, after=None):
        seen["after"] = after
        return [_worker_row(9, "Crawling 90%")]

    monkeypatch.setattr(log_service, "get_scan_logs", fake_logs)

    cursor = T0 + timedelta(seconds=5)
    events = await report_service.scan_events(
        Scan(id=uuid.uuid4(), config_id=uuid.uuid4()), after=cursor
    )

    assert seen["after"] == cursor
    assert [e.message for e in events] == ["Crawling 90%", "scan cancelled"]
    assert all(e.timestamp > cursor for e in events)


@pytest.mark.asyncio
async def test_a_naive_cursor_is_read_as_utc_not_compared_against_aware_rows(monkeypatch):
    """A client that sends `?after=` without an offset would otherwise blow up
    the in-memory audit comparison with a naive/aware TypeError.
    """
    audit = [{"timestamp": T0, "action": "scan_started"}]
    monkeypatch.setattr(
        report_service, "get_firestore_client", lambda: FakeFirestoreClient(docs=audit)
    )

    async def fake_logs(scan_id, after=None):
        return []

    monkeypatch.setattr(log_service, "get_scan_logs", fake_logs)

    events = await report_service.scan_events(
        Scan(id=uuid.uuid4(), config_id=uuid.uuid4()),
        after=datetime(2026, 1, 1, 11, 59, 59),
    )

    assert [e.action for e in events] == ["scan_started"]


@pytest.mark.asyncio
async def test_a_row_still_being_written_is_skipped_rather_than_crashing(monkeypatch):
    """Firestore SERVER_TIMESTAMP reads back as None until the write lands."""
    audit = [{"timestamp": None, "action": "scan_started"}]
    monkeypatch.setattr(
        report_service, "get_firestore_client", lambda: FakeFirestoreClient(docs=audit)
    )

    async def fake_logs(scan_id, after=None):
        return []

    monkeypatch.setattr(log_service, "get_scan_logs", fake_logs)

    events = await report_service.scan_events(
        Scan(id=uuid.uuid4(), config_id=uuid.uuid4()), after=T0
    )

    assert events == []


def test_status_endpoint_forwards_the_cursor(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _user()
    scan = make(Scan, config_id=uuid.uuid4(), status="completed")
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([make(Scan, id=scan.id, config_id=scan.config_id)])]
    )

    async def fake_readable(_scan_id, _user, _db):
        return scan, target

    async def fake_build_scan_out(_scan, _target, _db):
        return ScanOut(id=scan.id, status="completed", created_at=T0)

    seen = {}

    async def fake_events(_scan, after=None):
        seen["after"] = after
        return []

    monkeypatch.setattr(scans_router, "get_readable_scan", fake_readable)
    monkeypatch.setattr(
        scans_router.scan_view_service, "build_scan_out", fake_build_scan_out
    )
    monkeypatch.setattr(report_service, "scan_events", fake_events)

    resp = client.get(f"/api/scans/{scan.id}/status?after=2026-01-01T12:00:05%2B00:00")

    assert resp.status_code == 200
    assert seen["after"] == T0 + timedelta(seconds=5)


def test_status_endpoint_without_a_cursor_asks_for_everything(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: _user()
    scan = make(Scan, config_id=uuid.uuid4(), status="completed")
    target = make(Target, user_id=uuid.uuid4(), url="https://target.example")
    app.dependency_overrides[get_db] = lambda: FakeSession()

    async def fake_readable(_scan_id, _user, _db):
        return scan, target

    async def fake_build_scan_out(_scan, _target, _db):
        return ScanOut(id=scan.id, status="completed", created_at=T0)

    seen = {"after": "unset"}

    async def fake_events(_scan, after=None):
        seen["after"] = after
        return []

    monkeypatch.setattr(scans_router, "get_readable_scan", fake_readable)
    monkeypatch.setattr(
        scans_router.scan_view_service, "build_scan_out", fake_build_scan_out
    )
    monkeypatch.setattr(report_service, "scan_events", fake_events)

    resp = client.get(f"/api/scans/{scan.id}/status")

    assert resp.status_code == 200
    assert seen["after"] is None
    assert "config_id" not in resp.json()["scan"]
    assert "error_message" not in resp.json()["scan"]
