import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User


async def get_owned_scan(scan_id: uuid.UUID, user: User, db: AsyncSession) -> tuple[Scan, Target]:
    """Fetches a scan the requesting user owns, joined with its target.

    Ownership flows through scan_configs.user_id, not a direct column on
    scans — a 404 (not a 403) either way, so we don't leak whether a scan_id
    belonging to another user exists.
    """
    result = await db.execute(
        select(Scan, Target)
        .join(ScanConfig, ScanConfig.id == Scan.config_id)
        .join(Target, Target.id == ScanConfig.target_id)
        .where(Scan.id == scan_id, ScanConfig.user_id == user.id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return row[0], row[1]
