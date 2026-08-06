import uuid

from fpdf import FPDF
from google.cloud import firestore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import shared_settings
from app.db.firestore import get_firestore_client
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.user import User
from app.schemas.report import ReportAiInsight, ReportFinding, ScanReport
from app.schemas.scan import ScanEvent, SeverityCounts
from app.services import finding_stats_service, log_service
from app.services.scan_access import get_readable_scan

_AI_RESULTS_COLLECTION = "ai_results"
_AUDIT_EVENTS_COLLECTION = "audit_events"


async def get_scan_findings(scan_id: str) -> list[ReportFinding]:
    # Matches the scan_id ASC + severity DESC composite index (§6).
    client = get_firestore_client()
    query = (
        client.collection(_AI_RESULTS_COLLECTION)
        .where("scan_id", "==", scan_id)
        .order_by("severity", direction=firestore.Query.DESCENDING)
    )
    findings = []
    async for doc in query.stream():
        data = doc.to_dict()
        findings.append(
            ReportFinding(
                name=data["name"],
                risk=data["risk"],
                confidence=data.get("confidence"),
                description=data.get("description", ""),
                url=data.get("url", ""),
                param=data.get("param"),
                evidence=data.get("evidence"),
                cwe_id=data.get("cwe_id"),
                solution=data.get("solution"),
                cve_ids=data.get("cve_ids", []),
                severity=data["severity"],
                cvss_score=data["cvss_score"],
                summary=data["summary"],
                remediation=data["remediation"],
            )
        )
    return findings


async def build_scan_report(scan_id: uuid.UUID, user: User, db: AsyncSession) -> ScanReport:
    """Combines the DB scan/target/config with Firestore AI findings.

    Access-checked (raises 404 via get_readable_scan) so this is safe to call
    directly from any route needing a full report — the caller's own scans,
    or any scan at all if they are an admin.
    """
    scan, target = await get_readable_scan(scan_id, user, db)

    config_result = await db.execute(select(ScanConfig).where(ScanConfig.id == scan.config_id))
    config = config_result.scalar_one()

    findings = await get_scan_findings(str(scan.id))

    counts = finding_stats_service.empty_counts()
    for finding in findings:
        counts[finding_stats_service.normalise_severity(finding.severity)] += 1

    return ScanReport(
        scan_id=scan.id,
        status=scan.status,
        target_url=target.url,
        scan_type=config.scan_type,
        created_at=scan.created_at,
        started_at=scan.started_at,
        finished_at=scan.finished_at,
        findings=findings,
        counts=SeverityCounts(**counts),
        total_findings=len(findings),
        risk_score=finding_stats_service.risk_score(counts),
        events=await scan_events(scan),
        ai=_ai_insight(findings, counts),
    )


# ZAP's confidence vocabulary, highest first. Anything outside this (or a
# missing value) counts as unconfirmed.
_CONFIDENCE_WEIGHTS = {"confirmed": 1.0, "high": 0.9, "medium": 0.6, "low": 0.3}

_SEVERITY_RANK = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}


def _ai_insight(findings: list[ReportFinding], counts: dict[str, int]) -> ReportAiInsight:
    if not findings:
        return ReportAiInsight(
            headline="No findings",
            summary="The scan completed without recording any findings.",
            model=shared_settings.vertex_model,
        )

    ranked = sorted(
        findings,
        key=lambda f: (
            _SEVERITY_RANK.get(finding_stats_service.normalise_severity(f.severity), 1),
            f.cvss_score,
        ),
        reverse=True,
    )
    urgent = counts["critical"] + counts["high"]
    confidence = sum(
        _CONFIDENCE_WEIGHTS.get(str(f.confidence or "").lower(), 0.0) for f in findings
    ) / len(findings)

    return ReportAiInsight(
        headline=(
            f"{len(findings)} findings, {urgent} critical or high"
            if urgent
            else f"{len(findings)} findings, none critical or high"
        ),
        summary=ranked[0].summary,
        top_risks=[f.name for f in ranked[:3]],
        confidence=round(confidence, 2),
        model=shared_settings.vertex_model,
    )


async def scan_events(scan: Scan) -> list[ScanEvent]:
    """Full execution log for one scan, oldest first.

    Interleaves the API-side lifecycle trail (audit_events, written when a user
    starts or cancels a scan) with the scanner worker's step-by-step log
    (scan_logs). audit_events is queried on scan_id alone and the merged list
    is sorted here, so the cross-collection interleave needs no extra Firestore
    composite index beyond the two §6 already defines.
    """
    scan_id = str(scan.id)
    try:
        client = get_firestore_client()
        query = client.collection(_AUDIT_EVENTS_COLLECTION).where("scan_id", "==", scan_id)
        audit_rows = [doc.to_dict() async for doc in query.stream()]
        worker_rows = await log_service.get_scan_logs(scan_id)
    except Exception:  # noqa: BLE001 - the report is still useful without the trail
        return []

    events = [
        ScanEvent(
            timestamp=row["timestamp"],
            action=row.get("action", "event"),
            message=row.get("action", "event").replace("_", " "),
            level="error" if "fail" in row.get("action", "") else "info",
        )
        for row in audit_rows
        if row.get("timestamp")
    ]
    events += [
        ScanEvent(
            timestamp=row["timestamp"],
            action=row.get("event_type", "event"),
            message=row.get("message", ""),
            level=row.get("level", "info"),
        )
        for row in worker_rows
        if row.get("timestamp")
    ]
    return sorted(events, key=lambda e: e.timestamp)


def render_pdf(report: ScanReport) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Scan Report", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    for label, value in [
        ("Scan ID", str(report.scan_id)),
        ("Target", report.target_url),
        ("Scan type", report.scan_type),
        ("Status", report.status),
        ("Created", report.created_at.isoformat()),
        ("Started", report.started_at.isoformat() if report.started_at else "-"),
        ("Finished", report.finished_at.isoformat() if report.finished_at else "-"),
    ]:
        pdf.cell(0, 7, f"{label}: {value}", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, f"Findings ({len(report.findings)})", new_x="LMARGIN", new_y="NEXT")

    for finding in report.findings:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(
            0, 6, f"{finding.name}  [{finding.severity.upper()}]", new_x="LMARGIN", new_y="NEXT"
        )
        pdf.set_font("Helvetica", "", 10)
        cves = ", ".join(finding.cve_ids) if finding.cve_ids else "none"
        for line in [
            f"URL: {finding.url}",
            f"CVSS: {finding.cvss_score}   CVEs: {cves}",
            f"Summary: {finding.summary}",
            f"Remediation: {finding.remediation}",
        ]:
            pdf.multi_cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
