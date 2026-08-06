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


def _emitter(scan_id: str):
    """Builds the log helper this worker writes every step through.

    Each line goes to Firestore (where the API's status endpoint picks it up
    for the SPA's execution log) and to stdout (where it lands in Cloud
    Logging), so the two never disagree about what the scan did.
    """

    async def emit(event_type: str, message: str, level: str = "info") -> None:
        logger.info("[%s] %s", event_type, message)
        await log_service.log_scan_event(scan_id, event_type, message, level=level)

    return emit


async def _run(scan_id: str, target_url: str, scan_policy: str) -> None:
    emit = _emitter(scan_id)

    await emit("started", f"Starting {scan_policy} scan of {target_url}")

    await emit("zap_waiting", "Waiting for the ZAP daemon to accept connections")
    version = await zap_service.wait_until_ready(lambda m: emit("zap_waiting", m))
    await emit("zap_ready", f"ZAP daemon is up (version {version})", level="success")

    await emit("spider_start", f"Crawling {target_url} to discover pages and parameters")
    await zap_service.run_spider(target_url, lambda m: emit("spider_progress", m))
    await emit("spider_complete", "Spider crawl finished", level="success")

    await emit("passive_scan_start", "Draining the passive scan queue")
    await zap_service.wait_for_passive_scan(lambda m: emit("passive_scan_progress", m))
    await emit("passive_scan_complete", "Passive scan finished", level="success")

    if scan_policy == "full":
        await emit("active_scan_start", "Sending active attack payloads to the target")
        await zap_service.run_active_scan(target_url, lambda m: emit("active_scan_progress", m))
        await emit("active_scan_complete", "Active scan finished", level="success")
    else:
        await emit("active_scan_skipped", f"Active scan skipped for {scan_policy} policy")

    await emit("findings_start", "Collecting alerts from ZAP")
    findings = await zap_service.get_alerts(target_url)
    await emit(
        "findings_collected",
        f"{len(findings)} findings from ZAP",
        level="warn" if findings else "success",
    )

    if not findings:
        await emit("completed", "Scan completed successfully — nothing found", level="success")
        return

    await emit("ai_analysis_start", f"Analyzing {len(findings)} findings with Vertex AI")
    await ai_service.analyze_findings(scan_id, findings, lambda m: emit("ai_analysis_progress", m))
    await emit("ai_analysis_complete", "Vertex AI analysis complete", level="success")

    await emit("exploit_start", f"Confirming {len(findings)} findings against the live target")
    confirmed = 0
    for i, finding in enumerate(findings, start=1):
        result = await exploit_service.confirm_finding(scan_id, finding)
        confirmed += result["confirmed"]
        await emit(
            "exploit_progress",
            f"[{i}/{len(findings)}] {finding.name} — {result['detail']}",
            level="warn" if result["confirmed"] else "info",
        )
    await emit(
        "exploit_confirmation_complete",
        f"Exploit confirmation complete — {confirmed} of {len(findings)} reproduced",
        level="success",
    )

    await emit("completed", "Scan completed successfully", level="success")


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
    except Exception as exc:
        logger.exception("Scan %s failed", scan_id)
        # Best-effort — if Firestore itself is why we're here, don't let a
        # second failure mask the first in the exit code / logs.
        try:
            asyncio.run(
                log_service.log_scan_event(
                    scan_id,
                    "failed",
                    f"Scan failed: {type(exc).__name__}: {exc}",
                    level="error",
                )
            )
        except Exception:
            logger.exception("Also failed to write the failure event for scan %s", scan_id)
        # max_retries=0 on the job — a non-zero exit here is terminal, not
        # silently retried against the same target.
        sys.exit(1)


if __name__ == "__main__":
    main()
