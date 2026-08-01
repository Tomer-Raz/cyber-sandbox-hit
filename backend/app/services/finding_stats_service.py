"""Severity roll-ups over the Firestore `ai_results` collection.

The dashboard and the scan list both need per-scan severity counts, and both
are polled every few seconds by the SPA. Firestore bills per document read,
so results are cached in-process (see `_CACHE_TTL_SECONDS`) rather than
re-read on every poll.
"""

import time

from app.db.firestore import get_firestore_client

_AI_RESULTS_COLLECTION = "ai_results"

SEVERITIES = ("critical", "high", "medium", "low", "info")

# Firestore caps the value list of an `in` filter at 30.
_IN_FILTER_LIMIT = 30

_CACHE_TTL_SECONDS = 60.0

# scan_id -> (expires_at, counts)
_cache: dict[str, tuple[float, dict[str, int]]] = {}

# A finding's contribution to the 0-100 risk score. Two criticals or four
# highs already put a scan in the "high risk" band the SPA renders in red.
_RISK_WEIGHTS = {"critical": 25, "high": 12, "medium": 5, "low": 2, "info": 0}


def empty_counts() -> dict[str, int]:
    return {severity: 0 for severity in SEVERITIES}


def normalise_severity(value: str | None) -> str:
    """Maps a stored severity onto the five buckets the SPA renders.

    Vertex AI is prompted with "informational" (ai_service._RESPONSE_SCHEMA)
    while ZAP and the UI both say "info", so both spellings reach Firestore.
    """
    severity = str(value or "info").strip().lower()
    if severity in ("informational", "information", ""):
        return "info"
    return severity if severity in SEVERITIES else "info"


def risk_score(counts: dict[str, int]) -> float:
    total = sum(_RISK_WEIGHTS[severity] * counts.get(severity, 0) for severity in SEVERITIES)
    return float(min(100, total))


async def severity_counts_by_scan(scan_ids: list[str]) -> dict[str, dict[str, int]]:
    """Counts findings per severity for each scan id.

    Never raises: Firestore being unreachable degrades the dashboard to zeros
    rather than failing the whole request, since the scan rows themselves
    come from Cloud SQL and are still worth serving.
    """
    result = {scan_id: empty_counts() for scan_id in scan_ids}
    if not scan_ids:
        return result

    now = time.monotonic()
    misses = []
    for scan_id in scan_ids:
        cached = _cache.get(scan_id)
        if cached and cached[0] > now:
            result[scan_id] = dict(cached[1])
        else:
            misses.append(scan_id)

    if not misses:
        return result

    try:
        client = get_firestore_client()
        for start in range(0, len(misses), _IN_FILTER_LIMIT):
            chunk = misses[start : start + _IN_FILTER_LIMIT]
            query = client.collection(_AI_RESULTS_COLLECTION).where("scan_id", "in", chunk)
            async for doc in query.stream():
                data = doc.to_dict()
                scan_id = data.get("scan_id")
                if scan_id in result:
                    result[scan_id][normalise_severity(data.get("severity"))] += 1
    except Exception:  # noqa: BLE001 - see docstring
        return result

    expires_at = time.monotonic() + _CACHE_TTL_SECONDS
    for scan_id in misses:
        _cache[scan_id] = (expires_at, dict(result[scan_id]))

    return result
