"""Field tampering: what a client may set, and whether an export can be edited.

Two halves. The first pins down mass assignment — extra keys in a request body
must not reach a column the server owns. That part was already correct, so these
are regression guards rather than proof of a fix.

The second covers report signing, which was not correct: the export used to mint
a throwaway RSA keypair per request and return the signature and its public key
together, so anyone who edited a report could re-sign it. The tests below fail
against that version.
"""

import uuid
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.crypto import ReportSigner, get_report_signer
from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.routers import scans as scans_router
from app.routers import targets as targets_router
from app.schemas.report import ReportFinding, ScanReport
from app.services import report_service, scanner_job_service
from tests.conftest import FakeResult, FakeSession, make, passthrough_target_url

client = TestClient(app)


def _user() -> User:
    return User(id=uuid.uuid4(), google_sub="sub-1", email="student@hit.ac.il", name="Jane")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _patch_audit(monkeypatch):
    async def _noop(*_a, **_k):
        pass

    monkeypatch.setattr(scans_router, "log_audit_event", _noop)


# ---------------------------------------------------------------------------
# Mass assignment
# ---------------------------------------------------------------------------


def test_extra_body_keys_cannot_set_target_ownership_or_approval(monkeypatch):
    """`user_id`, `approved` and `id` are the server's to decide."""
    user = _user()
    app.dependency_overrides[get_current_user] = lambda: user
    session = FakeSession()
    app.dependency_overrides[get_db] = lambda: session
    monkeypatch.setattr(targets_router, "validate_target_url", passthrough_target_url)

    attacker_id = uuid.uuid4()
    forged_id = uuid.uuid4()
    resp = client.post(
        "/api/targets/",
        json={
            "url": "https://target.example",
            "description": "mine",
            "user_id": str(attacker_id),
            "approved": False,
            "id": str(forged_id),
        },
    )

    assert resp.status_code == 201
    target = session.added[0]
    assert target.user_id == user.id
    assert target.id != forged_id
    assert target.approved is True
    body = resp.json()
    assert body["id"] != str(forged_id)
    assert body["approved"] is True


def test_extra_body_keys_cannot_set_scan_owner_or_status(monkeypatch):
    user = _user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    session = FakeSession(
        execute_results=[FakeResult([target]), FakeResult([config])], scalar_results=[0]
    )
    app.dependency_overrides[get_db] = lambda: session
    monkeypatch.setattr(scans_router, "validate_target_url", passthrough_target_url)

    async def fake_start(**_kwargs):
        return "projects/p/locations/l/jobs/j/executions/e1"

    monkeypatch.setattr(scanner_job_service, "start_execution", fake_start)

    other_user = uuid.uuid4()
    resp = client.post(
        "/api/scans/",
        json={
            "target_id": str(target.id),
            "scan_type": "baseline",
            "user_id": str(other_user),
            "status": "completed",
            "config_id": str(uuid.uuid4()),
        },
    )

    assert resp.status_code == 201
    added_config = next(o for o in session.added if isinstance(o, ScanConfig))
    added_scan = next(o for o in session.added if isinstance(o, Scan))
    assert added_config.user_id == user.id
    assert added_scan.config_id == added_config.id
    # "pending" at insert, then "running" once the job accepts it — never a
    # status the caller asked for.
    assert added_scan.status == "running"


def test_unknown_scan_options_are_dropped_not_persisted(monkeypatch):
    user = _user()
    app.dependency_overrides[get_current_user] = lambda: user
    target = make(Target, user_id=user.id, url="https://target.example", approved=True)
    config = make(ScanConfig, user_id=user.id, target_id=target.id, scan_type="baseline")
    session = FakeSession(
        execute_results=[FakeResult([target]), FakeResult([config])], scalar_results=[0]
    )
    app.dependency_overrides[get_db] = lambda: session
    monkeypatch.setattr(scans_router, "validate_target_url", passthrough_target_url)

    async def fake_start(**_kwargs):
        return "projects/p/locations/l/jobs/j/executions/e1"

    monkeypatch.setattr(scanner_job_service, "start_execution", fake_start)

    resp = client.post(
        "/api/scans/",
        json={
            "target_id": str(target.id),
            "options": {"activeScan": True, "rootShell": True, "maxDepth": 3},
        },
    )

    assert resp.status_code == 201
    stored = next(o for o in session.added if isinstance(o, ScanConfig)).options
    assert stored["activeScan"] is True
    assert stored["maxDepth"] == 3
    assert "rootShell" not in stored


def test_scan_cannot_be_created_against_someone_elses_target():
    app.dependency_overrides[get_current_user] = lambda: _user()
    app.dependency_overrides[get_db] = lambda: FakeSession(execute_results=[FakeResult([])])

    resp = client.post("/api/scans/", json={"target_id": str(uuid.uuid4())})

    assert resp.status_code == 404


def test_role_is_not_a_client_settable_field():
    """`role` lives on the ORM model but is resolved from IAM on every request,
    so it is not in any request schema and cannot be sent in.
    """
    from app.schemas.scan import ScanCreate
    from app.schemas.target import TargetCreate

    for schema in (TargetCreate, ScanCreate):
        fields = set(schema.model_fields)
        assert not fields & {"role", "user_id", "id", "approved", "status", "created_at"}


# ---------------------------------------------------------------------------
# Report signing
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def signing_key_pem() -> bytes:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


@pytest.fixture
def _reset_signer_caches():
    get_settings.cache_clear()
    get_report_signer.cache_clear()
    yield
    get_settings.cache_clear()
    get_report_signer.cache_clear()


@pytest.fixture
def configured_signer(monkeypatch, signing_key_pem, _reset_signer_caches):
    monkeypatch.setenv("REPORT_SIGNING_KEY", signing_key_pem.decode("utf-8"))
    get_settings.cache_clear()
    get_report_signer.cache_clear()
    return ReportSigner(signing_key_pem)


@pytest.fixture
def no_signing_key(monkeypatch, _reset_signer_caches):
    monkeypatch.delenv("REPORT_SIGNING_KEY", raising=False)
    get_settings.cache_clear()
    get_report_signer.cache_clear()


def _sample_report() -> ScanReport:
    return ScanReport(
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


def _export(monkeypatch, report: ScanReport, fmt: str = "json"):
    app.dependency_overrides[get_current_user] = lambda: _user()
    app.dependency_overrides[get_db] = lambda: FakeSession()

    async def fake_build(_scan_id, _user, _db):
        return report

    monkeypatch.setattr(report_service, "build_scan_report", fake_build)
    return client.get(f"/api/reports/{report.scan_id}/export?format={fmt}")


def test_signer_is_none_when_no_key_is_configured(no_signing_key):
    assert get_report_signer() is None


def test_export_carries_no_signature_headers_without_a_key(monkeypatch, no_signing_key):
    resp = _export(monkeypatch, _sample_report())

    assert resp.status_code == 200
    assert "x-report-signature" not in resp.headers
    # The old code always emitted a key here, which is the whole problem: a
    # public key shipped alongside the signature certifies nothing.
    assert "x-report-public-key" not in resp.headers


@pytest.mark.parametrize("fmt", ["json", "pdf"])
def test_export_signature_verifies_against_the_configured_key(monkeypatch, configured_signer, fmt):
    resp = _export(monkeypatch, _sample_report(), fmt)

    assert resp.status_code == 200
    assert configured_signer.verify_report_signature(
        resp.content, resp.headers["x-report-signature"]
    )


def test_editing_the_exported_bytes_breaks_the_signature(monkeypatch, configured_signer):
    resp = _export(monkeypatch, _sample_report())
    tampered = resp.content.replace(b'"severity": "high"', b'"severity": "info"')

    assert tampered != resp.content
    assert not configured_signer.verify_report_signature(
        tampered, resp.headers["x-report-signature"]
    )


def test_the_signing_key_outlives_the_request(monkeypatch, configured_signer):
    """The point of the fix. The old code generated a fresh keypair per export,
    so each response published a different public key and nothing tied two
    exports together — a forger just swapped both headers.

    The signatures themselves still differ between the two calls: PSS salts
    randomly. The invariant that matters is that both verify under the *same*
    long-lived key, which is what a caller checks against.
    """
    report = _sample_report()
    first = _export(monkeypatch, report)
    second = _export(monkeypatch, report)

    assert first.content == second.content
    assert first.headers["x-report-public-key"] == second.headers["x-report-public-key"]
    assert configured_signer.verify_report_signature(
        first.content, first.headers["x-report-signature"]
    )
    assert configured_signer.verify_report_signature(
        second.content, second.headers["x-report-signature"]
    )


def test_published_public_key_is_the_configured_one(monkeypatch, configured_signer):
    resp = _export(monkeypatch, _sample_report())
    published = resp.headers["x-report-public-key"].replace("\\n", "\n")

    assert published == configured_signer.export_public_key_pem()


def test_a_forged_keypair_does_not_verify_against_the_real_one(monkeypatch, configured_signer):
    forger = ReportSigner(
        rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    resp = _export(monkeypatch, _sample_report())
    forged_body = resp.content.replace(b"completed", b"failed___")

    assert not configured_signer.verify_report_signature(
        forged_body, forger.sign_report(forged_body)
    )


def test_a_non_rsa_key_is_rejected_rather_than_silently_accepted():
    from cryptography.hazmat.primitives.asymmetric import ed25519

    pem = ed25519.Ed25519PrivateKey.generate().private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    with pytest.raises(ValueError, match="RSA private key"):
        ReportSigner(pem)
