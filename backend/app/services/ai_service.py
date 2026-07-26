import hashlib
import json

from google import genai
from google.cloud import firestore
from google.genai import types as genai_types

from app.core.config import shared_settings
from app.db.firestore import get_firestore_client
from app.schemas.finding import AnalyzeFindingsResult, FindingAnalysis, ZapFinding

_AI_RESULTS_COLLECTION = "ai_results"

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
    return json.loads(response.text)


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


async def analyze_findings(scan_id: str, findings: list[ZapFinding]) -> AnalyzeFindingsResult:
    """Sends ZAP findings to Vertex AI and returns CVE list/severity/CVSS per finding.

    Findings whose (plugin, name, risk, cwe) signature was analyzed before are
    served from the ai_results cache instead of re-calling the model.
    """
    if not findings:
        return AnalyzeFindingsResult(scan_id=scan_id, findings=[])

    client = get_firestore_client()
    signatures = [_finding_signature(f) for f in findings]

    results: list[FindingAnalysis | None] = []
    for sig in signatures:
        results.append(await _get_cached(client, sig))

    uncached_indices = [i for i, r in enumerate(results) if r is None]
    if uncached_indices:
        try:
            raw = await _call_vertex_ai([findings[i] for i in uncached_indices])
            items = raw["findings"]
        except AIServiceError:
            raise
        except Exception as exc:
            raise AIServiceError(f"Vertex AI request failed: {exc}") from exc

        for item in items:
            original_index = uncached_indices[item["index"]]
            results[original_index] = FindingAnalysis(
                cve_ids=item.get("cve_ids", []),
                severity=item["severity"],
                cvss_score=item["cvss_score"],
                summary=item["summary"],
                remediation=item["remediation"],
                cached=False,
            )

    for i, analysis in enumerate(results):
        if analysis is None:
            raise AIServiceError(f"Vertex AI response missing entry for finding {i}")

    finalized: list[FindingAnalysis] = results  # type: ignore[assignment]  # all slots filled above
    for sig, finding, analysis in zip(signatures, findings, finalized):
        await _store_result(client, scan_id, sig, finding, analysis)

    return AnalyzeFindingsResult(scan_id=scan_id, findings=finalized)
