import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import ADMIN_ROLE, User


async def _fetch_scan(scan_id: uuid.UUID, db: AsyncSession, user: User | None) -> tuple[Scan, Target]:
    """Loads a scan joined with its target, optionally restricted to an owner."""
    query = (
        select(Scan, Target)
        .join(ScanConfig, ScanConfig.id == Scan.config_id)
        .join(Target, Target.id == ScanConfig.target_id)
        .where(Scan.id == scan_id)
    )
    if user is not None:
        query = query.where(ScanConfig.user_id == user.id)

    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    return row[0], row[1]


async def get_owned_scan(scan_id: uuid.UUID, user: User, db: AsyncSession) -> tuple[Scan, Target]:
    """Fetches a scan the requesting user owns, joined with its target.

    Ownership flows through scan_configs.user_id, not a direct column on
    scans — a 404 (not a 403) either way, so we don't leak whether a scan_id
    belonging to another user exists.

    Strict even for admins: this backs the mutating routes, and an admin who
    can *see* every scan still has no reason to cancel someone else's.
    """
    return await _fetch_scan(scan_id, db, user)


async def get_readable_scan(scan_id: uuid.UUID, user: User, db: AsyncSession) -> tuple[Scan, Target]:
    """Same, but an admin may read any scan regardless of who owns it.

    Read-only callers only. The admin console lists every scan in the system,
    so drilling into one has to work across users — see `require_admin` for
    where that role comes from.
    """
    return await _fetch_scan(scan_id, db, None if user.role == ADMIN_ROLE else user)
