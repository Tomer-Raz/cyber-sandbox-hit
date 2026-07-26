from google.cloud import firestore

from app.db.firestore import get_firestore_client

_AUDIT_EVENTS_COLLECTION = "audit_events"


async def log_audit_event(user_id: str, action: str, **extra) -> None:
    client = get_firestore_client()
    await client.collection(_AUDIT_EVENTS_COLLECTION).add(
        {
            "user_id": user_id,
            "action": action,
            "timestamp": firestore.SERVER_TIMESTAMP,
            **extra,
        }
    )


async def get_audit_events(user_id: str, limit: int = 200) -> list[dict]:
    # Matches the user_id ASC + timestamp DESC composite index (§6).
    client = get_firestore_client()
    query = (
        client.collection(_AUDIT_EVENTS_COLLECTION)
        .where("user_id", "==", user_id)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    return [doc.to_dict() async for doc in query.stream()]
