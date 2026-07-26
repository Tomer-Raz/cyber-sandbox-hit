import pytest

from app.schemas.finding import FindingAnalysis, ZapFinding
from app.services import ai_service


def _finding(**overrides) -> ZapFinding:
    defaults = dict(
        plugin_id="40018",
        name="SQL Injection",
        risk="High",
        confidence="Medium",
        description="A SQL injection vulnerability was found.",
        url="https://target.example/login",
        param="username",
        evidence="' OR '1'='1",
        cwe_id=89,
        solution="Use parameterized queries.",
    )
    defaults.update(overrides)
    return ZapFinding(**defaults)


@pytest.mark.asyncio
async def test_analyze_findings_empty_list_returns_empty():
    result = await ai_service.analyze_findings("scan-1", [])
    assert result.scan_id == "scan-1"
    assert result.findings == []


@pytest.mark.asyncio
async def test_analyze_findings_calls_vertex_and_stores_result(monkeypatch):
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    async def fake_get_cached(client, signature):
        return None

    stored = []

    async def fake_store_result(client, scan_id, signature, finding, analysis):
        stored.append((scan_id, signature, analysis))

    async def fake_call_vertex_ai(findings):
        assert len(findings) == 1
        return {
            "findings": [
                {
                    "index": 0,
                    "cve_ids": ["CVE-2021-1234"],
                    "severity": "high",
                    "cvss_score": 8.2,
                    "summary": "Classic SQL injection in the login form.",
                    "remediation": "Use parameterized queries.",
                }
            ]
        }

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_store_result", fake_store_result)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    result = await ai_service.analyze_findings("scan-1", [_finding()])

    assert len(result.findings) == 1
    analysis = result.findings[0]
    assert analysis.cve_ids == ["CVE-2021-1234"]
    assert analysis.severity == "high"
    assert analysis.cvss_score == 8.2
    assert analysis.cached is False
    assert len(stored) == 1
    assert stored[0][0] == "scan-1"


@pytest.mark.asyncio
async def test_analyze_findings_uses_cache_without_calling_vertex(monkeypatch):
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    cached_analysis = FindingAnalysis(
        cve_ids=[],
        severity="medium",
        cvss_score=5.0,
        summary="Cached generic finding.",
        remediation="Add the header.",
        cached=True,
    )

    async def fake_get_cached(client, signature):
        return cached_analysis

    stored = []

    async def fake_store_result(client, scan_id, signature, finding, analysis):
        stored.append((scan_id, signature, analysis))

    async def fake_call_vertex_ai(findings):
        raise AssertionError("Vertex AI should not be called for a cache hit")

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_store_result", fake_store_result)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    result = await ai_service.analyze_findings("scan-2", [_finding()])

    assert result.findings == [cached_analysis]
    # Still recorded against this scan so the scan_id-scoped report query sees it.
    assert len(stored) == 1
    assert stored[0][0] == "scan-2"


@pytest.mark.asyncio
async def test_analyze_findings_raises_on_malformed_response(monkeypatch):
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    async def fake_get_cached(client, signature):
        return None

    async def fake_call_vertex_ai(findings):
        return {"findings": []}  # missing the entry for our one finding

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    with pytest.raises(ai_service.AIServiceError):
        await ai_service.analyze_findings("scan-3", [_finding()])


@pytest.mark.asyncio
async def test_analyze_findings_wraps_vertex_exceptions(monkeypatch):
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    async def fake_get_cached(client, signature):
        return None

    async def fake_call_vertex_ai(findings):
        raise RuntimeError("503 Service Unavailable")

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    with pytest.raises(ai_service.AIServiceError):
        await ai_service.analyze_findings("scan-4", [_finding()])


def test_finding_signature_is_stable_and_distinguishes_findings():
    a = _finding()
    b = _finding()
    c = _finding(name="XSS", cwe_id=79)

    assert ai_service._finding_signature(a) == ai_service._finding_signature(b)
    assert ai_service._finding_signature(a) != ai_service._finding_signature(c)
