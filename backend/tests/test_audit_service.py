import pytest

from app.services import audit_service
from tests.conftest import FakeFirestoreClient


@pytest.mark.asyncio
async def test_log_audit_event_writes_expected_fields(monkeypatch):
    fake_client = FakeFirestoreClient()
    monkeypatch.setattr(audit_service, "get_firestore_client", lambda: fake_client)

    await audit_service.log_audit_event("user-1", "scan_started", scan_id="scan-1")

    assert len(fake_client.collection_ref.added) == 1
    doc = fake_client.collection_ref.added[0]
    assert doc["user_id"] == "user-1"
    assert doc["action"] == "scan_started"
    assert doc["scan_id"] == "scan-1"


@pytest.mark.asyncio
async def test_get_audit_events_returns_matching_docs(monkeypatch):
    docs = [{"user_id": "user-1", "action": "scan_started"}]
    fake_client = FakeFirestoreClient(docs=docs)
    monkeypatch.setattr(audit_service, "get_firestore_client", lambda: fake_client)

    result = await audit_service.get_audit_events("user-1")

    assert result == docs
