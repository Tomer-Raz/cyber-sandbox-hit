from collections.abc import Awaitable, Callable

from google.cloud import firestore

from app.db.firestore import get_firestore_client

_SCAN_LOGS_COLLECTION = "scan_logs"

# Called with a human-readable line each time a long-running step makes
# progress, so the caller can stream it into the scan's execution log.
ProgressFn = Callable[[str], Awaitable[None]]


async def log_scan_event(
    scan_id: str, event_type: str, message: str, level: str = "info", **extra
) -> None:
    client = get_firestore_client()
    await client.collection(_SCAN_LOGS_COLLECTION).add(
        {
            "scan_id": scan_id,
            "event_type": event_type,
            "message": message,
            "level": level,
            "timestamp": firestore.SERVER_TIMESTAMP,
            **extra,
        }
    )


async def get_scan_logs(scan_id: str, limit: int = 2000) -> list[dict]:
    """Every step the scanner worker logged for one scan, newest first.

    Matches the scan_id ASC + timestamp DESC composite index (§6). The limit is
    a safety bound on the read, not a display cap — newest-first means that if
    a scan ever did exceed it, it's the oldest lines that get dropped.
    """
    client = get_firestore_client()
    query = (
        client.collection(_SCAN_LOGS_COLLECTION)
        .where("scan_id", "==", scan_id)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    return [doc.to_dict() async for doc in query.stream()]
