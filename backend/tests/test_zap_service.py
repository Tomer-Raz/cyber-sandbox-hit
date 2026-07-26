from types import SimpleNamespace

import pytest

from app.services import zap_service


@pytest.fixture(autouse=True)
def _fast_polling(monkeypatch):
    # Real polling sleeps 2s between checks — no reason to pay that in tests.
    monkeypatch.setattr(zap_service, "_POLL_INTERVAL_SECONDS", 0)


def _fake_zap(**overrides):
    defaults = dict(
        core=SimpleNamespace(version="2.17.0", access_url=lambda url: None, alerts=lambda baseurl: []),
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
        spider=SimpleNamespace(scan=lambda url: "spider-1", status=lambda scan_id: next(statuses))
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.run_spider("http://target.example")  # no exception


@pytest.mark.asyncio
async def test_run_spider_wraps_start_failure(monkeypatch):
    def raise_error(url):
        raise RuntimeError("ZAP unreachable")

    zap = _fake_zap(core=SimpleNamespace(access_url=raise_error))
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    with pytest.raises(zap_service.ZapServiceError):
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
        ascan=SimpleNamespace(scan=lambda url: "ascan-1", status=lambda scan_id: next(statuses))
    )
    monkeypatch.setattr(zap_service, "_get_zap", lambda: zap)

    await zap_service.run_active_scan("http://target.example")  # no exception


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
