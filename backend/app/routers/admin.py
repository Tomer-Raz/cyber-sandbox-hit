"""Admin-only, read-only views over every user and every scan.

There is deliberately no write route here. Identity (email, name) is owned by
the user's Google account and role is owned by the project's IAM policy — an
admin who could edit either in-app would just be creating drift that the next
request reverts.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.user import User
from app.schemas.admin import AdminScanOut, AdminUserOut
from app.services import scan_view_service

# Gate on the router, not per route: a new endpoint added here is admin-only
# by default rather than by remembering to say so.
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(db: AsyncSession = Depends(get_db)) -> list[AdminUserOut]:
    result = await db.execute(
        select(User, func.count(Scan.id), func.max(Scan.created_at))
        # Outer joins so a user who has never run a scan still appears, with 0.
        .outerjoin(ScanConfig, ScanConfig.user_id == User.id)
        .outerjoin(Scan, Scan.config_id == ScanConfig.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )
    return [
        AdminUserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            created_at=user.created_at,
            scan_count=scan_count or 0,
            last_scan_at=last_scan_at,
        )
        for user, scan_count, last_scan_at in result.all()
    ]


@router.get("/scans", response_model=list[AdminScanOut])
async def list_all_scans(db: AsyncSession = Depends(get_db)) -> list[AdminScanOut]:
    rows = await scan_view_service.load_all_scan_rows(db)
    # Reuses the normal builder so admin numbers match what the owner sees,
    # and so the Firestore severity roll-up stays batched into one round trip.
    scans = await scan_view_service.build_scan_outs([(s, c, t) for s, c, t, _ in rows])
    return [
        AdminScanOut(
            **scan.model_dump(),
            user_id=user.id,
            user_email=user.email,
            user_name=user.name,
        )
        for scan, (_s, _c, _t, user) in zip(scans, rows)
    ]
