"""Entrypoint for the scanner Cloud Run Job container.

Separate from app/main.py (the FastAPI service) but in the same codebase, so
it can reuse ai_service.py and the Firestore helpers without duplicating
them. Invoked as `python -m app.scanner_worker`, once per scan execution,
with TARGET_URL / SCAN_ID / SCAN_POLICY set as per-execution env overrides
(app/services/scanner_job_service.py) and GCP_PROJECT_ID / FIRESTORE_DATABASE
/ VERTEX_LOCATION / VERTEX_MODEL baked into the job template.
"""

import asyncio
import logging
import os
import sys

from app.core.config import shared_settings
from app.services import ai_service, exploit_service, log_service, zap_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("scanner_worker")


async def _run(scan_id: str, target_url: str, scan_policy: str) -> None:
    await log_service.log_scan_event(
        scan_id, "started", f"Starting {scan_policy} scan of {target_url}"
    )

    await zap_service.wait_until_ready()

    await zap_service.run_spider(target_url)
    await log_service.log_scan_event(scan_id, "spider_complete", "Spider crawl finished")

    await zap_service.wait_for_passive_scan()
    await log_service.log_scan_event(scan_id, "passive_scan_complete", "Passive scan finished")

    if scan_policy == "full":
        await zap_service.run_active_scan(target_url)
        await log_service.log_scan_event(scan_id, "active_scan_complete", "Active scan finished")

    findings = await zap_service.get_alerts(target_url)
    await log_service.log_scan_event(
        scan_id, "findings_collected", f"{len(findings)} findings from ZAP"
    )

    if findings:
        await ai_service.analyze_findings(scan_id, findings)
        await log_service.log_scan_event(
            scan_id, "ai_analysis_complete", "Vertex AI analysis complete"
        )

        for finding in findings:
            await exploit_service.confirm_finding(scan_id, finding)
        await log_service.log_scan_event(
            scan_id, "exploit_confirmation_complete", "Exploit confirmation complete"
        )

    await log_service.log_scan_event(scan_id, "completed", "Scan completed successfully")


def main() -> None:
    target_url = os.environ["TARGET_URL"]
    scan_id = os.environ["SCAN_ID"]
    scan_policy = os.environ.get("SCAN_POLICY", "baseline")

    logger.info(
        "Scanner worker starting: scan_id=%s target=%s policy=%s project=%s",
        scan_id,
        target_url,
        scan_policy,
        shared_settings.gcp_project_id,
    )

    try:
        asyncio.run(_run(scan_id, target_url, scan_policy))
    except Exception:
        logger.exception("Scan %s failed", scan_id)
        # Best-effort — if Firestore itself is why we're here, don't let a
        # second failure mask the first in the exit code / logs.
        try:
            asyncio.run(log_service.log_scan_event(scan_id, "failed", "Scan failed — see logs"))
        except Exception:
            logger.exception("Also failed to write the failure event for scan %s", scan_id)
        # max_retries=0 on the job — a non-zero exit here is terminal, not
        # silently retried against the same target.
        sys.exit(1)


if __name__ == "__main__":
    main()
