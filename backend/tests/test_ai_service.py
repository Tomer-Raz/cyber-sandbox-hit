from types import SimpleNamespace

import pytest
from google.genai import types as genai_types

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


def _analysis_item(index: int) -> dict:
    return {
        "index": index,
        "cve_ids": [],
        "severity": "low",
        "cvss_score": 3.1,
        "summary": "Generic finding.",
        "remediation": "Set the header.",
    }


@pytest.mark.asyncio
async def test_analyze_findings_sends_each_distinct_finding_once(monkeypatch):
    # A real scan repeats the same generic alert on every page. Sending the
    # duplicates ran the response past the model's output limit and came back as
    # truncated, unparseable JSON.
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    async def fake_get_cached(client, signature):
        return None

    async def fake_store_result(client, scan_id, signature, finding, analysis):
        return None

    batch_sizes = []

    async def fake_call_vertex_ai(findings):
        batch_sizes.append(len(findings))
        return {"findings": [_analysis_item(i) for i in range(len(findings))]}

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_store_result", fake_store_result)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    findings = [_finding(url=f"https://target.example/page{i}") for i in range(50)]
    findings += [_finding(name="XSS", cwe_id=79, url=f"https://t.example/{i}") for i in range(30)]

    result = await ai_service.analyze_findings("scan-5", findings)

    assert batch_sizes == [2]
    # Every duplicate still gets an analysis, fanned out from its representative.
    assert len(result.findings) == 80
    assert all(f.severity == "low" for f in result.findings)


@pytest.mark.asyncio
async def test_analyze_findings_splits_distinct_findings_into_bounded_batches(monkeypatch):
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())
    monkeypatch.setattr(ai_service, "_MAX_FINDINGS_PER_REQUEST", 20)

    async def fake_get_cached(client, signature):
        return None

    async def fake_store_result(client, scan_id, signature, finding, analysis):
        return None

    batch_sizes = []

    async def fake_call_vertex_ai(findings):
        batch_sizes.append(len(findings))
        return {"findings": [_analysis_item(i) for i in range(len(findings))]}

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_store_result", fake_store_result)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    findings = [_finding(name=f"Finding {i}", cwe_id=i) for i in range(45)]

    result = await ai_service.analyze_findings("scan-6", findings)

    assert batch_sizes == [20, 20, 5]
    assert len(result.findings) == 45


@pytest.mark.asyncio
async def test_analyze_findings_rejects_out_of_range_index(monkeypatch):
    # An index outside the batch would silently mis-attribute a severity to the
    # wrong finding, or wrap around to the end of the list.
    monkeypatch.setattr(ai_service, "get_firestore_client", lambda: object())

    async def fake_get_cached(client, signature):
        return None

    async def fake_call_vertex_ai(findings):
        return {"findings": [_analysis_item(7)]}

    monkeypatch.setattr(ai_service, "_get_cached", fake_get_cached)
    monkeypatch.setattr(ai_service, "_call_vertex_ai", fake_call_vertex_ai)

    with pytest.raises(ai_service.AIServiceError, match="index 7"):
        await ai_service.analyze_findings("scan-7", [_finding()])


def _fake_genai_client(response):
    async def generate_content(**kwargs):
        return response

    return SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(
        generate_content=generate_content
    )))


@pytest.mark.asyncio
async def test_call_vertex_ai_reports_truncation_rather_than_a_json_error(monkeypatch):
    # Hitting the output limit yields valid-looking JSON that just stops mid-object,
    # so json.loads' complaint about column 9847 says nothing about the real cause.
    response = SimpleNamespace(
        candidates=[SimpleNamespace(finish_reason=genai_types.FinishReason.MAX_TOKENS)],
        text='{"findings": [{"index": 0,',
    )
    monkeypatch.setattr(ai_service, "_get_genai_client", lambda: _fake_genai_client(response))

    with pytest.raises(ai_service.AIServiceError, match="MAX_TOKENS"):
        await ai_service._call_vertex_ai([_finding()])


@pytest.mark.asyncio
async def test_call_vertex_ai_rejects_an_empty_response(monkeypatch):
    response = SimpleNamespace(
        candidates=[SimpleNamespace(finish_reason=genai_types.FinishReason.STOP)],
        text="",
    )
    monkeypatch.setattr(ai_service, "_get_genai_client", lambda: _fake_genai_client(response))

    with pytest.raises(ai_service.AIServiceError, match="empty response"):
        await ai_service._call_vertex_ai([_finding()])


def test_finding_signature_is_stable_and_distinguishes_findings():
    a = _finding()
    b = _finding()
    c = _finding(name="XSS", cwe_id=79)

    assert ai_service._finding_signature(a) == ai_service._finding_signature(b)
    assert ai_service._finding_signature(a) != ai_service._finding_signature(c)
