import uuid

from fpdf import FPDF
from google.cloud import firestore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.firestore import get_firestore_client
from app.models.scan_config import ScanConfig
from app.models.user import User
from app.schemas.report import ReportFinding, ScanReport
from app.services.scan_access import get_owned_scan

_AI_RESULTS_COLLECTION = "ai_results"


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

    Ownership-checked (raises 404 via get_owned_scan) so this is safe to call
    directly from any route needing a full report for the requesting user.
    """
    scan, target = await get_owned_scan(scan_id, user, db)

    config_result = await db.execute(select(ScanConfig).where(ScanConfig.id == scan.config_id))
    config = config_result.scalar_one()

    findings = await get_scan_findings(str(scan.id))
    return ScanReport(
        scan_id=scan.id,
        status=scan.status,
        target_url=target.url,
        scan_type=config.scan_type,
        created_at=scan.created_at,
        started_at=scan.started_at,
        finished_at=scan.finished_at,
        findings=findings,
    )


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
