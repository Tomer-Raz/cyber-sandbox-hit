import pytest

from app.services import log_service
from tests.conftest import FakeFirestoreClient


@pytest.mark.asyncio
async def test_log_scan_event_writes_expected_fields(monkeypatch):
    fake_client = FakeFirestoreClient()
    monkeypatch.setattr(log_service, "get_firestore_client", lambda: fake_client)

    await log_service.log_scan_event("scan-1", "started", "Starting scan", extra_key="value")

    assert len(fake_client.collection_ref.added) == 1
    doc = fake_client.collection_ref.added[0]
    assert doc["scan_id"] == "scan-1"
    assert doc["event_type"] == "started"
    assert doc["message"] == "Starting scan"
    assert doc["extra_key"] == "value"


@pytest.mark.asyncio
async def test_get_scan_logs_returns_matching_docs(monkeypatch):
    docs = [{"scan_id": "scan-1", "event_type": "started"}, {"scan_id": "scan-1", "event_type": "completed"}]
    fake_client = FakeFirestoreClient(docs=docs)
    monkeypatch.setattr(log_service, "get_firestore_client", lambda: fake_client)

    result = await log_service.get_scan_logs("scan-1")

    assert result == docs
