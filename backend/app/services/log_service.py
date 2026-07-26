from google.cloud import firestore

from app.db.firestore import get_firestore_client

_SCAN_LOGS_COLLECTION = "scan_logs"


async def log_scan_event(scan_id: str, event_type: str, message: str, **extra) -> None:
    client = get_firestore_client()
    await client.collection(_SCAN_LOGS_COLLECTION).add(
        {
            "scan_id": scan_id,
            "event_type": event_type,
            "message": message,
            "timestamp": firestore.SERVER_TIMESTAMP,
            **extra,
        }
    )


async def get_scan_logs(scan_id: str, limit: int = 200) -> list[dict]:
    # Matches the scan_id ASC + timestamp DESC composite index (§6).
    client = get_firestore_client()
    query = (
        client.collection(_SCAN_LOGS_COLLECTION)
        .where("scan_id", "==", scan_id)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    return [doc.to_dict() async for doc in query.stream()]
