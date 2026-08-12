import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.core.deps import get_current_user, resolve_role
from app.db.session import get_db
from app.main import app
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.routers import admin as admin_router
from app.services import finding_stats_service
from tests.conftest import FakeResult, FakeSession, make

client = TestClient(app)

ADMIN_ROUTES = ("/api/admin/users", "/api/admin/scans")

# Any address will do — who is really an admin lives in the project IAM policy.
ADMIN_EMAIL = "owner@example.com"


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _user(email="student@hit.ac.il", name="Jane", role="user") -> User:
    return make(User, google_sub=f"sub-{email}", email=email, name=name, role=role)


def _stub_counts(monkeypatch, counts_by_scan):
    async def fake_counts(scan_ids):
        return {
            scan_id: {**finding_stats_service.empty_counts(), **counts_by_scan.get(scan_id, {})}
            for scan_id in scan_ids
        }

    monkeypatch.setattr(finding_stats_service, "severity_counts_by_scan", fake_counts)


def _stub_admin_emails(monkeypatch, *emails):
    """Stands in for the project's IAM bindings on the admin marker role."""

    async def fake_admin_emails():
        return frozenset(e.casefold() for e in emails)

    monkeypatch.setattr(deps.admin_directory, "admin_emails", fake_admin_emails)


def _scan_row(user: User, created_at: datetime) -> tuple[Scan, ScanConfig, Target, User]:
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    scan = make(Scan, config_id=config.id, status="completed", created_at=created_at)
    return scan, config, target, user


# ── Role resolution ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_iam_bound_verified_email_resolves_to_admin(monkeypatch):
    _stub_admin_emails(monkeypatch, ADMIN_EMAIL)
    claims = {"email": ADMIN_EMAIL, "email_verified": True}
    assert await resolve_role(claims) == "admin"


@pytest.mark.asyncio
async def test_iam_member_match_is_case_insensitive(monkeypatch):
    _stub_admin_emails(monkeypatch, "Owner@Example.com")
    claims = {"email": "owner@example.com", "email_verified": True}
    assert await resolve_role(claims) == "admin"


@pytest.mark.asyncio
async def test_unverified_email_never_resolves_to_admin(monkeypatch):
    """An account may assert any address; only a verified one can be trusted."""
    _stub_admin_emails(monkeypatch, ADMIN_EMAIL)
    claims = {"email": ADMIN_EMAIL, "email_verified": False}
    assert await resolve_role(claims) == "user"


@pytest.mark.asyncio
async def test_unbound_email_resolves_to_user(monkeypatch):
    _stub_admin_emails(monkeypatch, ADMIN_EMAIL)
    claims = {"email": "someone.else@example.com", "email_verified": True}
    assert await resolve_role(claims) == "user"


@pytest.mark.asyncio
async def test_no_bindings_grants_nobody(monkeypatch):
    _stub_admin_emails(monkeypatch)
    claims = {"email": ADMIN_EMAIL, "email_verified": True}
    assert await resolve_role(claims) == "user"


@pytest.mark.asyncio
async def test_missing_email_claim_resolves_to_user(monkeypatch):
    """An empty claim must not match an empty entry in the member set."""
    _stub_admin_emails(monkeypatch, "")
    assert await resolve_role({"email": "", "email_verified": True}) == "user"


# ── Access control ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_require_credentials(route):
    assert client.get(route).status_code == 403


@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_admin_routes_reject_a_regular_user(route):
    app.dependency_overrides[get_current_user] = lambda: _user(role="user")
    resp = client.get(route, headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Administrator access required"


# ── Views ─────────────────────────────────────────────────────────────────────


def test_admin_users_lists_every_user_with_their_activity():
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    never_scanned = _user(email="new@hit.ac.il", name="Newcomer")
    last_scan = datetime.now(timezone.utc) - timedelta(hours=3)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[
            FakeResult([(admin, 0, None), (member, 4, last_scan), (never_scanned, 0, None)])
        ]
    )

    body = client.get("/api/admin/users", headers={"Authorization": "Bearer whatever"}).json()

    assert [u["email"] for u in body] == [
        ADMIN_EMAIL,
        "student@hit.ac.il",
        "new@hit.ac.il",
    ]
    assert body[0]["role"] == "admin"
    assert body[1]["scan_count"] == 4
    assert body[1]["last_scan_at"] is not None
    # A user who has never scanned still shows up, rather than being joined away.
    assert body[2]["scan_count"] == 0
    assert body[2]["last_scan_at"] is None
    # Google's account identifier is not part of the payload.
    assert "google_sub" not in body[0]


def test_admin_scans_lists_other_users_scans_with_their_owner(monkeypatch):
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    now = datetime.now(timezone.utc)
    mine = _scan_row(admin, now)
    theirs = _scan_row(member, now - timedelta(minutes=5))

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([mine, theirs])]
    )
    _stub_counts(monkeypatch, {str(theirs[0].id): {"critical": 2}})

    body = client.get("/api/admin/scans", headers={"Authorization": "Bearer whatever"}).json()

    assert len(body) == 2
    assert body[0]["user_email"] == ADMIN_EMAIL
    # The whole point of the view: a scan the admin did not run is still listed,
    # attributed to whoever did, with the time it was created.
    assert body[1]["user_email"] == "student@hit.ac.il"
    assert body[1]["user_name"] == "Jane"
    assert body[1]["user_id"] == str(member.id)
    assert body[1]["counts"]["critical"] == 2
    assert body[1]["created_at"] is not None


def test_admin_can_open_another_users_scan():
    """The admin scan list links to each scan, so detail must work cross-user."""
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    scan, config, target, _ = _scan_row(member, datetime.now(timezone.utc))

    app.dependency_overrides[get_current_user] = lambda: admin
    # get_readable_scan drops the owner filter for an admin, so the row comes
    # back on the first query; build_scan_out then re-reads the config.
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([(scan, target)]), FakeResult([config])]
    )

    resp = client.get(f"/api/scans/{scan.id}", headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 200
    assert resp.json()["id"] == str(scan.id)


def test_admin_still_cannot_cancel_another_users_scan():
    """Reading everything is the grant; cancelling stays with the owner."""
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    scan, _config, _target, _ = _scan_row(member, datetime.now(timezone.utc))

    app.dependency_overrides[get_current_user] = lambda: admin
    # cancel uses the strict lookup, whose owner-filtered query matches nothing.
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([])])

    resp = client.delete(f"/api/scans/{scan.id}", headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 404


def test_regular_user_still_cannot_open_another_users_scan():
    member = _user()
    scan, _config, _target, _ = _scan_row(_user(email="other@hit.ac.il"), datetime.now(timezone.utc))

    app.dependency_overrides[get_current_user] = lambda: member
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([])])

    resp = client.get(f"/api/scans/{scan.id}", headers={"Authorization": "Bearer whatever"})
    assert resp.status_code == 404


def test_blocking_is_the_only_thing_admins_can_write():
    """Identity comes from Google and role from IAM, so neither is editable.

    Blocking is the sole exception, so any *other* write route appearing under
    /api/admin means something upstream-owned has been made editable here.
    """
    writes = {
        (route.path, method)
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/admin")
        for method in getattr(route, "methods", set())
        if method not in {"GET", "HEAD", "OPTIONS"}
    }
    assert writes == {
        ("/api/admin/users/{user_id}/block", "POST"),
        ("/api/admin/users/{user_id}/unblock", "POST"),
    }


# ── User detail ───────────────────────────────────────────────────────────────


def _stub_audit_events(monkeypatch, events):
    async def fake_get_audit_events(user_id, limit=200):
        return list(events)

    monkeypatch.setattr(admin_router.audit_service, "get_audit_events", fake_get_audit_events)


def _capture_audit_events(monkeypatch) -> list[dict]:
    written: list[dict] = []

    async def fake_log(user_id, action, **extra):
        written.append({"user_id": user_id, "action": action, **extra})

    monkeypatch.setattr(admin_router.audit_service, "log_audit_event", fake_log)
    return written


def test_user_detail_separates_sign_ins_from_other_activity(monkeypatch):
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    signed_in_at = datetime.now(timezone.utc) - timedelta(hours=1)

    _stub_audit_events(
        monkeypatch,
        [
            {"action": "signed_in", "timestamp": signed_in_at, "user_id": str(member.id)},
            {
                "action": "scan_started",
                "timestamp": signed_in_at,
                "user_id": str(member.id),
                "scan_id": "scan-1",
            },
        ],
    )
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([(member, 4, signed_in_at)])],
        scalar_results=[2, signed_in_at],
    )

    body = client.get(
        f"/api/admin/users/{member.id}", headers={"Authorization": "Bearer whatever"}
    ).json()

    assert body["scan_count"] == 4
    assert body["target_count"] == 2
    assert [e["action"] for e in body["sign_ins"]] == ["signed_in"]
    assert [e["action"] for e in body["activity"]] == ["scan_started"]
    # Extras ride along in `details` rather than needing a column each.
    assert body["activity"][0]["details"]["scan_id"] == "scan-1"
    # user_id is the key the events were queried by, not new information.
    assert "user_id" not in body["activity"][0]["details"]


def test_user_detail_404s_for_an_unknown_user():
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([])])

    resp = client.get(
        f"/api/admin/users/{uuid.uuid4()}", headers={"Authorization": "Bearer whatever"}
    )
    assert resp.status_code == 404


# ── Blocking ──────────────────────────────────────────────────────────────────


def test_blocking_a_user_records_who_did_it(monkeypatch):
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    written = _capture_audit_events(monkeypatch)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([(member, 0, None)])],
        get_results={member.id: member},
    )

    resp = client.post(
        f"/api/admin/users/{member.id}/block", headers={"Authorization": "Bearer whatever"}
    )

    assert resp.status_code == 200
    assert resp.json()["blocked_at"] is not None
    assert member.blocked_at is not None
    # Attribution is the point: a block with no actor is not auditable.
    assert member.blocked_by == admin.id
    assert written == [
        {
            "user_id": str(member.id),
            "action": "user_blocked",
            "actor_id": str(admin.id),
            "actor_email": ADMIN_EMAIL,
        }
    ]


def test_blocking_an_admin_is_refused(monkeypatch):
    """Stops self-lockout and one admin evicting another."""
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    other_admin = _user(email="second@example.com", name="Bob", role="admin")
    written = _capture_audit_events(monkeypatch)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        get_results={other_admin.id: other_admin, admin.id: admin}
    )

    for target in (other_admin, admin):
        resp = client.post(
            f"/api/admin/users/{target.id}/block", headers={"Authorization": "Bearer whatever"}
        )
        assert resp.status_code == 409
        assert "IAM" in resp.json()["detail"]
        assert target.blocked_at is None

    assert written == []


def test_unblocking_clears_the_block_and_its_attribution(monkeypatch):
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    member.blocked_at = datetime.now(timezone.utc)
    member.blocked_by = admin.id
    written = _capture_audit_events(monkeypatch)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([(member, 0, None)])],
        get_results={member.id: member},
    )

    resp = client.post(
        f"/api/admin/users/{member.id}/unblock", headers={"Authorization": "Bearer whatever"}
    )

    assert resp.status_code == 200
    assert resp.json()["blocked_at"] is None
    assert member.blocked_at is None
    assert member.blocked_by is None
    assert [e["action"] for e in written] == ["user_unblocked"]


def test_blocking_an_already_blocked_user_does_not_re_stamp_it(monkeypatch):
    """Re-blocking would otherwise overwrite when the block actually started."""
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    member = _user()
    original = datetime.now(timezone.utc) - timedelta(days=2)
    member.blocked_at = original
    written = _capture_audit_events(monkeypatch)

    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession(
        execute_results=[FakeResult([(member, 0, None)])],
        get_results={member.id: member},
    )

    client.post(f"/api/admin/users/{member.id}/block", headers={"Authorization": "Bearer whatever"})

    assert member.blocked_at == original
    assert written == []


def test_blocking_an_unknown_user_404s():
    admin = _user(email=ADMIN_EMAIL, name="Ada", role="admin")
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: FakeSession()

    resp = client.post(
        f"/api/admin/users/{uuid.uuid4()}/block", headers={"Authorization": "Bearer whatever"}
    )
    assert resp.status_code == 404
