"""Admin-only views over every user and every scan.

Identity (email, name) is owned by the user's Google account and role is owned
by the project's IAM policy, so neither is editable here — an admin who could
change either in-app would just be creating drift that the next request
reverts. Blocking is the one exception, and the only write in this module:
whether an account may use *this* application is not something Google or IAM
has an opinion about.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_admin
from app.db.session import get_db
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import ADMIN_ROLE, User
from app.schemas.admin import AdminActivityEvent, AdminScanOut, AdminUserDetail, AdminUserOut
from app.services import audit_service, scan_view_service

# Gate on the router, not per route: a new endpoint added here is admin-only
# by default rather than by remembering to say so.
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

_SIGN_IN_ACTION = "signed_in"
_ACTIVITY_LIMIT = 200


def _scan_aggregate_query():
    return (
        select(User, func.count(Scan.id), func.max(Scan.created_at))
        # Outer joins so a user who has never run a scan still appears, with 0.
        .outerjoin(ScanConfig, ScanConfig.user_id == User.id)
        .outerjoin(Scan, Scan.config_id == ScanConfig.id)
        .group_by(User.id)
    )


def _to_user_out(user: User, scan_count: int | None, last_scan_at) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at,
        scan_count=scan_count or 0,
        last_scan_at=last_scan_at,
        last_login_at=user.last_login_at,
        blocked_at=user.blocked_at,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(db: AsyncSession = Depends(get_db)) -> list[AdminUserOut]:
    result = await db.execute(_scan_aggregate_query().order_by(User.created_at.desc()))
    return [
        _to_user_out(user, scan_count, last_scan_at)
        for user, scan_count, last_scan_at in result.all()
    ]


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> AdminUserDetail:
    result = await db.execute(_scan_aggregate_query().where(User.id == user_id))
    row = result.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user, scan_count, last_scan_at = row

    target_count = await db.scalar(
        select(func.count(Target.id)).where(Target.user_id == user_id)
    )
    first_scan_at = await db.scalar(
        select(func.min(Scan.created_at))
        .join(ScanConfig, Scan.config_id == ScanConfig.id)
        .where(ScanConfig.user_id == user_id)
    )

    blocked_by_email = None
    if user.blocked_by is not None:
        blocked_by_email = await db.scalar(select(User.email).where(User.id == user.blocked_by))

    # One read, split by action: sign-ins are the same audit stream, and asking
    # Firestore twice would need a second composite index for no benefit.
    events = await audit_service.get_audit_events(str(user_id), limit=_ACTIVITY_LIMIT)
    sign_ins, activity = [], []
    for event in events:
        parsed = _to_activity_event(event)
        (sign_ins if parsed.action == _SIGN_IN_ACTION else activity).append(parsed)

    return AdminUserDetail(
        **_to_user_out(user, scan_count, last_scan_at).model_dump(),
        blocked_by_email=blocked_by_email,
        target_count=target_count or 0,
        first_scan_at=first_scan_at,
        activity=activity,
        sign_ins=sign_ins,
    )


def _to_activity_event(event: dict) -> AdminActivityEvent:
    known = {"action", "timestamp", "user_id"}
    return AdminActivityEvent(
        action=event.get("action") or "unknown",
        timestamp=event.get("timestamp"),
        details={k: v for k, v in event.items() if k not in known},
    )


@router.post("/users/{user_id}/block", response_model=AdminUserOut, status_code=status.HTTP_200_OK)
async def block_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
) -> AdminUserOut:
    user = await _get_user_or_404(user_id, db)

    # Covers blocking yourself, and stops two admins from being able to lock
    # each other out. Revoking someone's admin role in IAM is the way to make
    # an admin blockable, which keeps that decision where the role lives.
    if user.role == ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Administrators cannot be blocked. Remove the admin role in GCP IAM first.",
        )

    if not user.is_blocked:
        user.blocked_at = datetime.now(timezone.utc)
        user.blocked_by = actor.id
        await db.commit()
        await db.refresh(user)
        await audit_service.log_audit_event(
            user_id=str(user.id),
            action="user_blocked",
            actor_id=str(actor.id),
            actor_email=actor.email,
        )

    return await _reload_user_out(user, db)


@router.post("/users/{user_id}/unblock", response_model=AdminUserOut)
async def unblock_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
) -> AdminUserOut:
    user = await _get_user_or_404(user_id, db)

    if user.is_blocked:
        user.blocked_at = None
        user.blocked_by = None
        await db.commit()
        await db.refresh(user)
        await audit_service.log_audit_event(
            user_id=str(user.id),
            action="user_unblocked",
            actor_id=str(actor.id),
            actor_email=actor.email,
        )

    return await _reload_user_out(user, db)


async def _reload_user_out(user: User, db: AsyncSession) -> AdminUserOut:
    """Re-reads the scan aggregates so the response matches a list row."""
    result = await db.execute(_scan_aggregate_query().where(User.id == user.id))
    row = result.first()
    if row is None:
        return _to_user_out(user, 0, None)
    found, scan_count, last_scan_at = row
    return _to_user_out(found, scan_count, last_scan_at)


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
