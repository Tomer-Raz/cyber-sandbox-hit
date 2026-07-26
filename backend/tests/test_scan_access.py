import uuid

import pytest
from fastapi import HTTPException

from app.models.scan import Scan
from app.models.target import Target
from app.services.scan_access import get_owned_scan
from tests.conftest import FakeResult, FakeSession


def _user(user_id=None):
    return type("U", (), {"id": user_id or uuid.uuid4()})()


@pytest.mark.asyncio
async def test_get_owned_scan_returns_scan_and_target():
    scan_id = uuid.uuid4()
    scan = Scan(id=scan_id, config_id=uuid.uuid4(), status="completed")
    target = Target(id=uuid.uuid4(), user_id=uuid.uuid4(), url="https://target.example")
    session = FakeSession(execute_results=[FakeResult([(scan, target)])])

    got_scan, got_target = await get_owned_scan(scan_id, _user(), session)

    assert got_scan is scan
    assert got_target is target


@pytest.mark.asyncio
async def test_get_owned_scan_raises_404_when_not_found_or_not_owned():
    session = FakeSession(execute_results=[FakeResult([])])

    with pytest.raises(HTTPException) as exc_info:
        await get_owned_scan(uuid.uuid4(), _user(), session)

    assert exc_info.value.status_code == 404
