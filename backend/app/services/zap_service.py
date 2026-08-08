import asyncio
from collections.abc import Callable

from zapv2 import ZAPv2

from app.schemas.finding import ZapFinding
from app.services.log_service import ProgressFn

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


async def _poll_until_done(
    probe: Callable[[], tuple[bool, str]],
    max_wait_seconds: int,
    step_name: str,
    on_progress: ProgressFn | None = None,
) -> None:
    """Polls `probe` until it reports done, reporting each change it sees.

    `probe` returns (done, detail) where detail is a short status like "40%".
    Only changes are reported, so a step that sits at the same percentage for
    minutes produces one log line rather than one per poll.
    """
    elapsed = 0
    last_detail: str | None = None
    while elapsed < max_wait_seconds:
        done, detail = await asyncio.to_thread(probe)
        if on_progress and detail != last_detail:
            await on_progress(f"{step_name} {detail}")
            last_detail = detail
        if done:
            return
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        elapsed += _POLL_INTERVAL_SECONDS
    raise ZapServiceError(f"{step_name} did not finish within {max_wait_seconds}s")


async def wait_until_ready(on_progress: ProgressFn | None = None) -> str:
    """Blocks until the ZAP daemon's REST API responds, returning its version.

    The container entrypoint starts the daemon and this worker as separate
    processes, so the daemon may still be initializing when this runs.
    """
    zap = _get_zap()
    elapsed = 0
    while elapsed < _ZAP_READY_MAX_WAIT_SECONDS:
        try:
            return await asyncio.to_thread(lambda: zap.core.version)
        except Exception:
            if on_progress and elapsed and elapsed % 5 == 0:
                await on_progress(f"Waiting for ZAP daemon to start ({elapsed}s)")
            await asyncio.sleep(1)
            elapsed += 1
    raise ZapServiceError("ZAP daemon did not become ready in time")


async def run_spider(target_url: str, on_progress: ProgressFn | None = None) -> None:
    """Crawls the target to discover pages/params. Always run, baseline and
    full policy alike — this is passive from the target's point of view.
    """
    zap = _get_zap()
    try:
        await asyncio.to_thread(zap.core.access_url, target_url)
        if on_progress:
            await on_progress(f"Fetched {target_url} as the crawl seed")
        scan_id = await asyncio.to_thread(zap.spider.scan, target_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to start spider: {exc}") from exc

    def probe() -> tuple[bool, str]:
        percent = int(zap.spider.status(scan_id))
        return percent >= 100, f"{percent}%"

    await _poll_until_done(probe, _SPIDER_MAX_WAIT_SECONDS, "Crawling", on_progress)

    if on_progress:
        urls = await asyncio.to_thread(zap.spider.results, scan_id)
        await on_progress(f"Crawl discovered {len(urls)} URLs")


async def wait_for_passive_scan(on_progress: ProgressFn | None = None) -> None:
    """Passive scan runs automatically in the background against everything
    the spider crawls — this just waits for its queue to drain.
    """
    zap = _get_zap()

    def probe() -> tuple[bool, str]:
        remaining = int(zap.pscan.records_to_scan)
        return remaining == 0, f"queue: {remaining} records left"

    await _poll_until_done(probe, _SPIDER_MAX_WAIT_SECONDS, "Passive scan", on_progress)


async def run_active_scan(target_url: str, on_progress: ProgressFn | None = None) -> None:
    """Sends attack payloads — only ever called for scan_policy == "full",
    against a target that has already cleared SSRF + approval checks.
    """
    zap = _get_zap()

    # יצירת חלופות של ה-URL (עם ובלי סלאש בסוף) להתאמה למבנה האתר ב-ZAP
    url_variants = [target_url]
    if target_url.endswith('/'):
        url_variants.append(target_url.rstrip('/'))
    else:
        url_variants.append(f"{target_url}/")

    scan_id = None
    last_exception = None

    for url_candidate in url_variants:
        try:
            res = await asyncio.to_thread(zap.ascan.scan, url_candidate)
            if str(res).isdigit():
                scan_id = res
                break
        except Exception as exc:
            last_exception = exc

    if scan_id is None:
        if on_progress:
            await on_progress(f"Active scan skipped: Target URL not indexed in ZAP sites tree ({last_exception})")
        return

    def probe() -> tuple[bool, str]:
        try:
            percent = int(zap.ascan.status(scan_id))
            return percent >= 100, f"{percent}%"
        except Exception:
            return True, "100%"

    await _poll_until_done(probe, _ACTIVE_SCAN_MAX_WAIT_SECONDS, "Active scan", on_progress)


async def get_alerts(target_url: str) -> list[ZapFinding]:
    zap = _get_zap()
    try:
        raw_alerts = await asyncio.to_thread(zap.core.alerts, target_url)
        if not raw_alerts:
            alt_url = target_url.rstrip('/') if target_url.endswith('/') else f"{target_url}/"
            raw_alerts = await asyncio.to_thread(zap.core.alerts, alt_url)
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