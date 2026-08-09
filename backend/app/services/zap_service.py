import asyncio
from collections.abc import Callable
from urllib.parse import urlsplit

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


def _origin(url: str) -> str:
    """Normalizes a URL to the `scheme://host[:port]` form ZAP keys its sites
    tree by, dropping the port when it's the scheme's default (as ZAP does).
    """
    parts = urlsplit(url)
    default_port = {"http": 80, "https": 443}.get(parts.scheme)
    host = parts.hostname or ""
    netloc = host if parts.port in (None, default_port) else f"{host}:{parts.port}"
    return f"{parts.scheme}://{netloc}"


def _check_scan_id(value: object, step_name: str) -> None:
    """ZAP's action endpoints answer HTTP 200 with an error code in the body
    (`url_not_found`, `internal_error`, ...) instead of failing the request, and
    the client returns that code as an ordinary string. Only a numeric scan id
    means the scan actually started, so anything else has to be raised here or
    it silently becomes "no findings".
    """
    if not str(value).isdigit():
        raise ZapServiceError(f"ZAP refused to start the {step_name}: {value}")


async def _indexed_site(target_url: str) -> str | None:
    """The target's entry in ZAP's sites tree, or None if ZAP never got a
    response from it. ZAP only indexes hosts that actually answered, so this
    doubles as the reachability check.
    """
    zap = _get_zap()
    try:
        sites = await asyncio.to_thread(lambda: zap.core.sites)
    except Exception as exc:
        raise ZapServiceError(f"Failed to read ZAP's sites tree: {exc}") from exc
    if not isinstance(sites, list):
        raise ZapServiceError(f"Failed to read ZAP's sites tree: {sites}")
    wanted = _origin(target_url)
    return next((site for site in sites if _origin(site) == wanted), None)


async def _indexed_urls(site: str) -> list[str]:
    """Every URL ZAP has indexed under `site`, which must be a value ZAP itself
    reported so the lookup is guaranteed to resolve.
    """
    zap = _get_zap()
    try:
        urls = await asyncio.to_thread(zap.core.urls, site)
    except Exception as exc:
        raise ZapServiceError(f"Failed to list indexed URLs for {site}: {exc}") from exc
    return urls if isinstance(urls, list) else []


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
    except Exception as exc:
        raise ZapServiceError(f"Failed to fetch {target_url}: {exc}") from exc

    # A target that never answered leaves ZAP with an empty sites tree, and
    # every later step then succeeds against nothing: the spider still reports
    # its robots.txt/sitemap.xml probes, the passive queue still drains, and the
    # scan lands on "completed, 0 findings". Fail loudly instead — a false
    # "clean" result is the worst thing this scanner can report.
    if await _indexed_site(target_url) is None:
        raise ZapServiceError(
            f"{target_url} returned no response to ZAP, so nothing was scanned. "
            "Check that the host is up and reachable from the scanner "
            "(DNS, egress firewall, and that the scheme and port are correct)."
        )

    if on_progress:
        await on_progress(f"Fetched {target_url} as the crawl seed")

    try:
        scan_id = await asyncio.to_thread(zap.spider.scan, target_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to start spider: {exc}") from exc
    _check_scan_id(scan_id, "spider")

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

    # ZAP can only attack nodes that are already in its sites tree, and it keys
    # them by the URL it actually saw — which needn't be the one we asked for
    # (trailing slash, or a redirect to another host or scheme). Start from a
    # URL ZAP itself reported rather than guessing at spellings of ours.
    site = await _indexed_site(target_url)
    if site is None:
        raise ZapServiceError(
            f"{target_url} is not in ZAP's sites tree, so there is nothing to "
            "attack — the crawl never reached this target."
        )
    indexed = await _indexed_urls(site)
    start_url = next((url for url in indexed if urlsplit(url).path in ("", "/")), site)

    try:
        scan_id = await asyncio.to_thread(zap.ascan.scan, start_url)
    except Exception as exc:
        raise ZapServiceError(f"Failed to start active scan on {start_url}: {exc}") from exc
    _check_scan_id(scan_id, "active scan")

    def probe() -> tuple[bool, str]:
        status = zap.ascan.status(scan_id)
        if not str(status).isdigit():
            raise ZapServiceError(f"ZAP lost track of active scan {scan_id}: {status}")
        percent = int(status)
        return percent >= 100, f"{percent}%"

    await _poll_until_done(probe, _ACTIVE_SCAN_MAX_WAIT_SECONDS, "Active scan", on_progress)


async def get_alerts(target_url: str) -> list[ZapFinding]:
    zap = _get_zap()
    # Filter by origin, not by the seed URL: ZAP matches `baseurl` as a prefix,
    # and alerts are raised against the pages the crawl found rather than the
    # URL we passed in.
    try:
        raw_alerts = await asyncio.to_thread(zap.core.alerts, _origin(target_url))
    except Exception as exc:
        raise ZapServiceError(f"Failed to fetch alerts: {exc}") from exc
    if not isinstance(raw_alerts, list):
        raise ZapServiceError(f"Failed to fetch alerts: {raw_alerts}")

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