import hashlib
import json

from google import genai
from google.cloud import firestore
from google.genai import types as genai_types

from app.core.config import shared_settings
from app.db.firestore import get_firestore_client
from app.schemas.finding import AnalyzeFindingsResult, FindingAnalysis, ZapFinding
from app.services.log_service import ProgressFn

_AI_RESULTS_COLLECTION = "ai_results"

# How many distinct findings go into one model request. The response carries a
# summary plus remediation per finding, so an unbounded batch runs past the
# model's output allowance and comes back as truncated, unparseable JSON.
_MAX_FINDINGS_PER_REQUEST = 20

# google-genai's response_schema is an OpenAPI 3.0 subset — uppercase TYPE enum,
# not JSON Schema's lowercase.
_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "findings": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "index": {"type": "INTEGER"},
                    "cve_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "severity": {
                        "type": "STRING",
                        "enum": ["critical", "high", "medium", "low", "informational"],
                    },
                    "cvss_score": {"type": "NUMBER"},
                    "summary": {"type": "STRING"},
                    "remediation": {"type": "STRING"},
                },
                "required": [
                    "index",
                    "cve_ids",
                    "severity",
                    "cvss_score",
                    "summary",
                    "remediation",
                ],
            },
        },
    },
    "required": ["findings"],
}

_genai_client: genai.Client | None = None


class AIServiceError(Exception):
    """Raised when Vertex AI can't be reached or returns something unusable."""


def _get_genai_client() -> genai.Client:
    # Built lazily, not at import time, for the same reason as every other
    # GCP client in this app (see db/session.py) — it resolves ADC.
    global _genai_client
    if _genai_client is None:
        _genai_client = genai.Client(
            vertexai=True,
            project=shared_settings.gcp_project_id,
            location=shared_settings.vertex_location,
        )
    return _genai_client


def _finding_signature(finding: ZapFinding) -> str:
    # Identity of "the same kind of finding", independent of which scan or
    # target it came from — this is the cache key so identical generic ZAP
    # alerts (e.g. missing security headers) don't re-pay an LLM call.
    key = f"{finding.plugin_id}|{finding.name}|{finding.risk}|{finding.cwe_id}"
    return hashlib.sha256(key.encode()).hexdigest()


def _build_prompt(findings: list[ZapFinding]) -> str:
    items = [
        {
            "index": i,
            "name": f.name,
            "risk": f.risk,
            "confidence": f.confidence,
            "description": f.description,
            "url": f.url,
            "param": f.param,
            "evidence": f.evidence,
            "cwe_id": f.cwe_id,
            "solution": f.solution,
        }
        for i, f in enumerate(findings)
    ]
    return (
        "You are a security analyst reviewing OWASP ZAP scan findings for an "
        "authorized web application penetration test. For each finding below, "
        "identify any specific CVEs it plausibly corresponds to (empty list if "
        "it's a generic vulnerability class rather than a specific known CVE), "
        "assign a severity (critical/high/medium/low/informational) and an "
        "estimated CVSS v3.1 base score, a one-to-two sentence summary, and "
        "concrete remediation advice. Return exactly one entry per input "
        "finding, matched back by its index.\n\n"
        f"Findings:\n{json.dumps(items, default=str)}"
    )


async def _call_vertex_ai(findings: list[ZapFinding]) -> dict:
    client = _get_genai_client()
    response = await client.aio.models.generate_content(
        model=shared_settings.vertex_model,
        contents=_build_prompt(findings),
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_RESPONSE_SCHEMA,
            temperature=0.2,
        ),
    )
    candidate = response.candidates[0] if response.candidates else None
    finish_reason = candidate.finish_reason if candidate else None
    if finish_reason is not None and finish_reason != genai_types.FinishReason.STOP:
        # Without this the caller only sees whatever JSONDecodeError the partial
        # response happens to produce, which says nothing about the real cause.
        raise AIServiceError(
            f"Vertex AI stopped early ({finish_reason.name}) and returned an "
            "incomplete response"
        )
    if not response.text:
        raise AIServiceError("Vertex AI returned an empty response")
    return json.loads(response.text)


async def _analyze_by_signature(
    representatives: list[tuple[str, ZapFinding]],
    on_progress: ProgressFn | None = None,
) -> dict[str, FindingAnalysis]:
    """Analyzes one representative finding per signature, in bounded batches."""
    analyses: dict[str, FindingAnalysis] = {}
    total_batches = -(-len(representatives) // _MAX_FINDINGS_PER_REQUEST)

    for batch_number, start in enumerate(
        range(0, len(representatives), _MAX_FINDINGS_PER_REQUEST), start=1
    ):
        batch = representatives[start : start + _MAX_FINDINGS_PER_REQUEST]
        if on_progress:
            await on_progress(
                f"Analyzing batch {batch_number}/{total_batches} "
                f"({len(batch)} findings) with {shared_settings.vertex_model}"
            )
        try:
            raw = await _call_vertex_ai([finding for _, finding in batch])
            items = raw["findings"]
        except AIServiceError:
            raise
        except Exception as exc:
            raise AIServiceError(f"Vertex AI request failed: {exc}") from exc

        for item in items:
            index = item["index"]
            if not isinstance(index, int) or not 0 <= index < len(batch):
                raise AIServiceError(
                    f"Vertex AI returned index {index}, which is not one of the "
                    f"{len(batch)} findings it was sent"
                )
            signature, _ = batch[index]
            analyses[signature] = FindingAnalysis(
                cve_ids=item.get("cve_ids", []),
                severity=item["severity"],
                cvss_score=item["cvss_score"],
                summary=item["summary"],
                remediation=item["remediation"],
                cached=False,
            )

    return analyses


async def _get_cached(client: firestore.AsyncClient, signature: str) -> FindingAnalysis | None:
    # Equality-only filter: covered by Firestore's automatic single-field
    # index, so this doesn't need one of the composite indexes from §6.
    query = client.collection(_AI_RESULTS_COLLECTION).where(
        "finding_signature", "==", signature
    ).limit(1)
    async for doc in query.stream():
        data = doc.to_dict()
        return FindingAnalysis(
            cve_ids=data["cve_ids"],
            severity=data["severity"],
            cvss_score=data["cvss_score"],
            summary=data["summary"],
            remediation=data["remediation"],
            cached=True,
        )
    return None


async def _store_result(
    client: firestore.AsyncClient,
    scan_id: str,
    signature: str,
    finding: ZapFinding,
    analysis: FindingAnalysis,
) -> None:
    # One doc per (scan_id, finding) even on a cache hit, so report queries
    # against this scan_id (the scan_id ASC + severity DESC index) return the
    # complete set regardless of which findings were freshly analyzed. The raw
    # finding fields are stored too — the AI enrichment alone (CVE/severity)
    # is meaningless in a report without what was actually found.
    await client.collection(_AI_RESULTS_COLLECTION).add(
        {
            "scan_id": scan_id,
            "finding_signature": signature,
            "name": finding.name,
            "risk": finding.risk,
            "confidence": finding.confidence,
            "description": finding.description,
            "url": finding.url,
            "param": finding.param,
            "evidence": finding.evidence,
            "cwe_id": finding.cwe_id,
            "solution": finding.solution,
            "cve_ids": analysis.cve_ids,
            "severity": analysis.severity,
            "cvss_score": analysis.cvss_score,
            "summary": analysis.summary,
            "remediation": analysis.remediation,
            "cached": analysis.cached,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
    )


async def analyze_findings(
    scan_id: str, findings: list[ZapFinding], on_progress: ProgressFn | None = None
) -> AnalyzeFindingsResult:
    """Sends ZAP findings to Vertex AI and returns CVE list/severity/CVSS per finding.

    Findings whose (plugin, name, risk, cwe) signature was analyzed before are
    served from the ai_results cache instead of re-calling the model.
    """
    if not findings:
        return AnalyzeFindingsResult(scan_id=scan_id, findings=[])

    client = get_firestore_client()
    signatures = [_finding_signature(f) for f in findings]

    results: list[FindingAnalysis | None] = []
    for i, sig in enumerate(signatures):
        cached = await _get_cached(client, sig)
        results.append(cached)
        if on_progress:
            hit = "cache hit" if cached else "needs analysis"
            await on_progress(f"[{i + 1}/{len(findings)}] {findings[i].name} — {hit}")

    uncached_indices = [i for i, r in enumerate(results) if r is None]
    if uncached_indices:
        # Analyze each distinct signature once and fan the answer back out. A scan
        # of any real site repeats the same generic alert (missing header, cookie
        # flag) on every page, and sending the duplicates would push the response
        # past the model's output limit for no extra information.
        representatives: dict[str, ZapFinding] = {}
        for i in uncached_indices:
            representatives.setdefault(signatures[i], findings[i])

        if on_progress:
            await on_progress(
                f"Sending {len(representatives)} distinct findings "
                f"({len(uncached_indices)} total) to Vertex AI "
                f"({shared_settings.vertex_model})"
            )

        analyses = await _analyze_by_signature(list(representatives.items()), on_progress)
        for i in uncached_indices:
            results[i] = analyses.get(signatures[i])

    for i, analysis in enumerate(results):
        if analysis is None:
            raise AIServiceError(f"Vertex AI response missing entry for finding {i}")

    finalized: list[FindingAnalysis] = results  # type: ignore[assignment]  # all slots filled above
    for i, (sig, finding, analysis) in enumerate(zip(signatures, findings, finalized)):
        await _store_result(client, scan_id, sig, finding, analysis)
        if on_progress:
            cves = ", ".join(analysis.cve_ids) or "no CVE match"
            await on_progress(
                f"[{i + 1}/{len(findings)}] {finding.name} — {analysis.severity} "
                f"(CVSS {analysis.cvss_score}, {cves})"
            )

    return AnalyzeFindingsResult(scan_id=scan_id, findings=finalized)
