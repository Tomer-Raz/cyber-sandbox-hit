import uuid
from datetime import datetime, timezone

import pytest

from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.schemas.report import ReportFinding, ScanReport
from app.services import report_service
from tests.conftest import FakeFirestoreClient, FakeResult, FakeSession


def _user(user_id=None, role="user"):
    return type("U", (), {"id": user_id or uuid.uuid4(), "role": role})()


def _ai_result_doc(**overrides):
    defaults = dict(
        name="SQL Injection",
        risk="High",
        confidence="Medium",
        description="desc",
        url="https://target.example/login",
        param="username",
        evidence="' OR '1'='1",
        cwe_id=89,
        solution="Use parameterized queries.",
        cve_ids=["CVE-2021-1234"],
        severity="high",
        cvss_score=8.2,
        summary="Classic SQL injection.",
        remediation="Use parameterized queries.",
    )
    defaults.update(overrides)
    return defaults


@pytest.mark.asyncio
async def test_get_scan_findings_maps_firestore_docs(monkeypatch):
    fake_client = FakeFirestoreClient(docs=[_ai_result_doc()])
    monkeypatch.setattr(report_service, "get_firestore_client", lambda: fake_client)

    findings = await report_service.get_scan_findings("scan-1")

    assert len(findings) == 1
    assert findings[0].name == "SQL Injection"
    assert findings[0].cve_ids == ["CVE-2021-1234"]
    assert findings[0].cvss_score == 8.2


@pytest.mark.asyncio
async def test_get_scan_findings_empty_when_no_docs(monkeypatch):
    fake_client = FakeFirestoreClient(docs=[])
    monkeypatch.setattr(report_service, "get_firestore_client", lambda: fake_client)

    findings = await report_service.get_scan_findings("scan-1")

    assert findings == []


@pytest.mark.asyncio
async def test_build_scan_report_combines_db_and_firestore(monkeypatch):
    scan_id = uuid.uuid4()
    config_id = uuid.uuid4()
    scan = Scan(
        id=scan_id,
        config_id=config_id,
        status="completed",
        created_at=datetime.now(timezone.utc),
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
    )
    target = Target(id=uuid.uuid4(), user_id=uuid.uuid4(), url="https://target.example")
    config = ScanConfig(id=config_id, user_id=uuid.uuid4(), target_id=target.id, scan_type="full")

    session = FakeSession(
        execute_results=[
            FakeResult([(scan, target)]),  # get_readable_scan's join query
            FakeResult([config]),  # config lookup
        ]
    )

    async def fake_get_scan_findings(sid):
        assert sid == str(scan_id)
        return [ReportFinding(**_ai_result_doc())]

    monkeypatch.setattr(report_service, "get_scan_findings", fake_get_scan_findings)

    report = await report_service.build_scan_report(scan_id, _user(), session)

    assert report.scan_id == scan_id
    assert report.target_url == "https://target.example"
    assert report.scan_type == "full"
    assert len(report.findings) == 1


def test_render_pdf_produces_valid_pdf_bytes():
    report = ScanReport(
        scan_id=uuid.uuid4(),
        status="completed",
        target_url="https://target.example",
        scan_type="baseline",
        created_at=datetime.now(timezone.utc),
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
        findings=[
            ReportFinding(**_ai_result_doc()),
            ReportFinding(**_ai_result_doc(name="XSS", severity="medium", cve_ids=[])),
        ],
    )

    pdf_bytes = report_service.render_pdf(report)

    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 0


def test_render_pdf_handles_zero_findings():
    report = ScanReport(
        scan_id=uuid.uuid4(),
        status="completed",
        target_url="https://target.example",
        scan_type="baseline",
        created_at=datetime.now(timezone.utc),
        findings=[],
    )

    pdf_bytes = report_service.render_pdf(report)

    assert pdf_bytes.startswith(b"%PDF-")
