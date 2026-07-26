import asyncio
from collections.abc import Callable

from zapv2 import ZAPv2

from app.schemas.finding import ZapFinding

# The ZAP daemon runs as a separate process in the same scanner container
# (started by the container entrypoint before this worker), reachable only
# over localhost.
_ZAP_BASE_URL = "http://localhost:8080"

_POLL_INTERVAL_SECONDS = 2
_ZAP_READY_MAX_WAIT_SECONDS = 60
_SPIDER_MAX_WAIT_SECONDS = 600
_ACTIVE_SCAN_MAX_WAIT_SECONDS = 1200

_zap: ZAPv2 | None = None


class ZapServiceError(Exception):
    """Raised when the ZAP daemon can't be reached or a scan step fails."""


def _get_zap() -> ZAPv2:
    global _zap
    if _zap is None:
        _zap = ZAPv2(apikey=None, proxies={"http": _ZAP_BASE_URL, "https": _ZAP_BASE_URL})
    return _zap


async def _poll_until_done(is_done: Callable[[], bool], max_wait_seconds: int, step_name: str) -> None:
    elapsed = 0
    while elapsed < max_wait_seconds:
        if await asyncio.to_thread(is_done):
            return
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        elapsed += _POLL_INTERVAL_SECONDS
    raise ZapServiceError(f"{step_name} did not finish within {max_wait_seconds}s")


async def wait_until_ready() -> None:
    """Blocks until the ZAP daemon's REST API responds.

    The container entrypoint starts the daemon and this worker as separate
    processes, so the daemon may still be initializing when this runs.
    """
    zap = _get_zap()
    elapsed = 0
    while elapsed < _ZAP_READY_MAX_WAIT_SECONDS:
        try:
            await asyncio.to_thread(lambda: zap.core.version)
            return
        except Exception:
            await asyncio.sleep(1)
            elapsed += 1
    raise ZapServiceError("ZAP daemon did not become ready in time")


async def run_spider(target_url: str) -> None:
    """Crawls the target to discover pages/params. Always run, baseline and
    full policy alike — this is passive from the target's point of view.
    """
    zap = _get_zap()
    try:
        await asyncio.to_thread(zap.core.access_url, target_url)
        scan_id = await asyncio.to_thread(zap.spider.scan, target_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to start spider: {exc}") from exc

    await _poll_until_done(
        lambda: int(zap.spider.status(scan_id)) >= 100, _SPIDER_MAX_WAIT_SECONDS, "Spider"
    )


async def wait_for_passive_scan() -> None:
    """Passive scan runs automatically in the background against everything
    the spider crawls — this just waits for its queue to drain.
    """
    zap = _get_zap()
    await _poll_until_done(
        lambda: int(zap.pscan.records_to_scan) == 0,
        _SPIDER_MAX_WAIT_SECONDS,
        "Passive scan",
    )


async def run_active_scan(target_url: str) -> None:
    """Sends attack payloads — only ever called for scan_policy == "full",
    against a target that has already cleared SSRF + approval checks.
    Target authorization is enforced by the API, not here (requirements.md
    §10) — this function trusts the URL it's given.
    """
    zap = _get_zap()
    try:
        scan_id = await asyncio.to_thread(zap.ascan.scan, target_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to start active scan: {exc}") from exc

    await _poll_until_done(
        lambda: int(zap.ascan.status(scan_id)) >= 100,
        _ACTIVE_SCAN_MAX_WAIT_SECONDS,
        "Active scan",
    )


async def get_alerts(target_url: str) -> list[ZapFinding]:
    zap = _get_zap()
    try:
        raw_alerts = await asyncio.to_thread(zap.core.alerts, target_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to fetch alerts: {exc}") from exc

    findings = []
    for alert in raw_alerts:
        cwe_id = alert.get("cweid")
        findings.append(
            ZapFinding(
                plugin_id=str(alert.get("pluginId", "")),
                name=alert.get("alert") or alert.get("name", ""),
                risk=alert.get("risk", ""),
                confidence=alert.get("confidence") or None,
                description=alert.get("description", ""),
                url=alert.get("url", ""),
                param=alert.get("param") or None,
                evidence=alert.get("evidence") or None,
                cwe_id=int(cwe_id) if cwe_id not in (None, "", "-1") else None,
                solution=alert.get("solution") or None,
            )
        )
    return findings
