from types import SimpleNamespace

import pytest

from app.services import zap_service


@pytest.fixture(autouse=True)
def _fast_polling(monkeypatch):
    # Real polling sleeps 2s between checks — no reason to pay that in tests.
    monkeypatch.setattr(zap_service, "_POLL_INTERVAL_SECONDS", 0)


def _fake_core(**overrides):
    defaults = dict(
        version="2.17.0",
        access_url=lambda url: None,
        alerts=lambda baseurl: [],
        # A reachable target is one ZAP managed to index.
        sites=["http://target.example"],
        urls=lambda baseurl: ["http://target.example/"],
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fake_zap(**overrides):
    defaults = dict(
        core=_fake_core(),
        spider=SimpleNamespace(scan=lambda url: "0", status=lambda scan_id: "100"),
        pscan=SimpleNamespace(records_to_scan=0),
        ascan=SimpleNamespace(scan=lambda url: "0", status=lambda scan_id: "100"),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.mark.asyncio
async def test_wait_until_ready_succeeds_once_zap_responds(monkeypatch):
    monkeypatch.setattr(zap_service, "_get_zap", lambda: _fake_zap())
    await zap_service.wait_until_ready()  # no exception


class _UnreachableCore:
    @property
    def version(self):
        raise ConnectionError("not up yet")


@pytest.mark.asyncio
async def test_wait_until_ready_times_out(monkeypatch):
    monkeypatch.setattr(zap_service, "_ZAP_READY_MAX_WAIT_SECONDS", 0)
    zap = SimpleNamespace(core=_UnreachableCore())
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError):
        await zap_service.wait_until_ready()


@pytest.mark.asyncio
async def test_run_spider_polls_until_status_100(monkeypatch):
    statuses = iter(["0", "40", "100"])
    zap = _fake_zap(
        spider=SimpleNamespace(scan=lambda url: "1", status=lambda scan_id: next(statuses))
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.run_spider("http://target.example")  # no exception


@pytest.mark.asyncio
async def test_run_spider_reports_each_progress_change(monkeypatch):
    statuses = iter(["0", "0", "40", "100"])
    zap = _fake_zap(
        spider=SimpleNamespace(
            scan=lambda url: "1",
            status=lambda scan_id: next(statuses),
            results=lambda scan_id: ["http://target.example/", "http://target.example/login"],
        )
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    lines = []

    async def on_progress(line):
        lines.append(line)

    await zap_service.run_spider("http://target.example", on_progress)

    # The repeated "0" is polled twice but reported once — a step that sits at
    # one percentage shouldn't flood the log with a line per poll.
    assert lines == [
        "Fetched http://target.example as the crawl seed",
        "Crawling 0%",
        "Crawling 40%",
        "Crawling 100%",
        "Crawl discovered 2 URLs",
    ]


@pytest.mark.asyncio
async def test_run_spider_wraps_start_failure(monkeypatch):
    def raise_error(url):
        raise RuntimeError("ZAP unreachable")

    zap = _fake_zap(core=SimpleNamespace(access_url=raise_error))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError):
        await zap_service.run_spider("http://target.example")


@pytest.mark.asyncio
async def test_run_spider_fails_when_target_never_responded(monkeypatch):
    # ZAP only indexes hosts that answered, so an empty sites tree means the
    # target was unreachable. Scanning on would report a clean bill of health
    # for a host that was never contacted.
    zap = _fake_zap(core=_fake_core(sites=[]))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError, match="returned no response"):
        await zap_service.run_spider("http://target.example")


@pytest.mark.asyncio
async def test_run_spider_fails_when_zap_refuses_to_start_it(monkeypatch):
    # ZAP answers 200 with an error code in the body rather than failing the
    # request, so the client hands back a plain string and raises nothing.
    zap = _fake_zap(spider=SimpleNamespace(scan=lambda url: "internal_error"))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError, match="internal_error"):
        await zap_service.run_spider("http://target.example")


@pytest.mark.asyncio
async def test_wait_for_passive_scan_times_out(monkeypatch):
    monkeypatch.setattr(zap_service, "_SPIDER_MAX_WAIT_SECONDS", 0)
    zap = _fake_zap(pscan=SimpleNamespace(records_to_scan=5))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError):
        await zap_service.wait_for_passive_scan()


@pytest.mark.asyncio
async def test_run_active_scan_polls_until_status_100(monkeypatch):
    statuses = iter(["0", "100"])
    zap = _fake_zap(
        ascan=SimpleNamespace(scan=lambda url: "1", status=lambda scan_id: next(statuses))
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.run_active_scan("http://target.example")  # no exception


@pytest.mark.asyncio
async def test_run_active_scan_raises_when_zap_rejects_the_url(monkeypatch):
    # Regression: this used to be swallowed into a log line and a normal return,
    # so a scan that attacked nothing still finished as "completed, 0 findings".
    zap = _fake_zap(ascan=SimpleNamespace(scan=lambda url: "url_not_found"))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError, match="url_not_found"):
        await zap_service.run_active_scan("http://target.example")


@pytest.mark.asyncio
async def test_run_active_scan_raises_when_target_is_not_indexed(monkeypatch):
    zap = _fake_zap(core=_fake_core(sites=["http://other.example"]))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError, match="not in ZAP's sites tree"):
        await zap_service.run_active_scan("http://target.example")


@pytest.mark.asyncio
async def test_run_active_scan_attacks_a_url_zap_actually_indexed(monkeypatch):
    # The caller's URL has no trailing slash; ZAP indexed one that does. Attack
    # ZAP's spelling, since that's the only one its sites tree can resolve.
    attacked = []
    zap = _fake_zap(
        ascan=SimpleNamespace(
            scan=lambda url: attacked.append(url) or "1", status=lambda scan_id: "100"
        )
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.run_active_scan("http://target.example")

    assert attacked == ["http://target.example/"]


def test_origin_normalizes_default_ports():
    # ZAP omits the default port in its sites tree, so the target URL has to be
    # reduced the same way or the reachability check misses a live host.
    assert zap_service._origin("https://a.example:443/x?y=1") == "https://a.example"
    assert zap_service._origin("http://a.example:80/x") == "http://a.example"
    assert zap_service._origin("http://a.example:8080/x") == "http://a.example:8080"


@pytest.mark.asyncio
async def test_get_alerts_filters_by_origin(monkeypatch):
    # ZAP matches `baseurl` as a prefix, and alerts hang off the crawled pages
    # rather than the seed URL we passed in.
    asked = []
    zap = _fake_zap(core=_fake_core(alerts=lambda baseurl: asked.append(baseurl) or []))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.get_alerts("http://target.example/some/page")

    assert asked == ["http://target.example"]


@pytest.mark.asyncio
async def test_get_alerts_maps_raw_zap_alerts_to_findings(monkeypatch):
    raw_alerts = [
        {
            "pluginId": "40018",
            "alert": "SQL Injection",
            "risk": "High",
            "confidence": "Medium",
            "description": "desc",
            "url": "http://target.example/login",
            "param": "username",
            "evidence": "' OR '1'='1",
            "cweid": "89",
            "solution": "Use parameterized queries.",
        },
        {
            # cweid of "-1" is ZAP's "not applicable" sentinel.
            "pluginId": "10021",
            "alert": "X-Content-Type-Options Missing",
            "risk": "Low",
            "cweid": "-1",
        },
    ]
    zap = _fake_zap(core=SimpleNamespace(alerts=lambda baseurl: raw_alerts))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    findings = await zap_service.get_alerts("http://target.example")

    assert len(findings) == 2
    assert findings[0].plugin_id == "40018"
    assert findings[0].name == "SQL Injection"
    assert findings[0].cwe_id == 89
    assert findings[1].cwe_id is None
    assert findings[1].confidence is None


@pytest.mark.asyncio
async def test_get_alerts_wraps_failure(monkeypatch):
    def raise_error(baseurl):
        raise RuntimeError("ZAP unreachable")

    zap = _fake_zap(core=SimpleNamespace(alerts=raise_error))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError):
        await zap_service.get_alerts("http://target.example")
