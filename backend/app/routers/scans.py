import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.ssrf import UnsafeTargetURLError, validate_target_url
from app.db.session import get_db
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.schemas.report import ScanReport
from app.schemas.scan import ScanCreate, ScanOut, ScanStatusOut
from app.services import report_service, scan_view_service, scanner_job_service
from app.services.audit_service import log_audit_event
from app.services.scan_access import get_owned_scan, get_readable_scan
from app.services.scanner_job_service import ScannerJobError

router = APIRouter(prefix="/api/scans", tags=["scans"])

_ACTIVE_STATUSES = ("pending", "running")


@router.get("/", response_model=list[ScanOut])
async def list_scans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScanOut]:
    rows = await scan_view_service.load_owned_scan_rows(user, db)
    return await scan_view_service.build_scan_outs(rows)


@router.post("/", response_model=ScanOut, status_code=status.HTTP_201_CREATED)
async def create_scan(
    body: ScanCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanOut:
    result = await db.execute(
        select(Target).where(Target.id == body.target_id, Target.user_id == user.id)
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    if not target.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target is not approved")

    # Re-checked at scan start, not just at target creation — DNS can change
    # between the two (rebinding), and this is the only authorization gate
    # scoping what the scanner can reach (requirements.md §10).
    try:
        validate_target_url(target.url)
    except UnsafeTargetURLError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    config = ScanConfig(
        user_id=user.id, target_id=target.id, scan_type=body.scan_type, options=body.options
    )
    db.add(config)
    await db.flush()

    scan = Scan(config_id=config.id, status="pending")
    db.add(scan)
    await db.flush()

    try:
        execution_name = await scanner_job_service.start_execution(
            scan_id=str(scan.id), target_url=target.url, scan_policy=body.scan_type
        )
    except ScannerJobError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to start scan: {exc}"
        ) from exc

    scan.execution_name = execution_name
    scan.status = "running"
    scan.started_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(scan)

    await log_audit_event(
        user_id=str(user.id), action="scan_started", scan_id=str(scan.id), target_id=str(target.id)
    )
    return await scan_view_service.build_scan_out(scan, target, db)


@router.get("/{scan_id}", response_model=ScanOut)
async def get_scan(
    scan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanOut:
    scan, target = await get_readable_scan(scan_id, user, db)
    return await scan_view_service.build_scan_out(scan, target, db)


@router.get("/{scan_id}/status", response_model=ScanStatusOut)
async def get_scan_status(
    scan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanStatusOut:
    scan, target = await get_readable_scan(scan_id, user, db)

    if scan.status in _ACTIVE_STATUSES and scan.execution_name:
        try:
            live = await scanner_job_service.get_execution_status(scan.execution_name)
        except ScannerJobError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to fetch scan status: {exc}"
            ) from exc

        if live["status"] != scan.status:
            scan.status = live["status"]
            scan.started_at = scan.started_at or live["started_at"]
            scan.finished_at = live["finished_at"]
            await db.commit()
            await db.refresh(scan)

    return ScanStatusOut(
        scan=await scan_view_service.build_scan_out(scan, target, db),
        events=await report_service.scan_events(scan),
    )


@router.get("/{scan_id}/report", response_model=ScanReport)
async def get_scan_report(
    scan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanReport:
    return await report_service.build_scan_report(scan_id, user, db)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_scan(
    scan_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    scan, target = await get_owned_scan(scan_id, user, db)

    if scan.status not in _ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Scan already {scan.status}"
        )

    if scan.execution_name:
        try:
            await scanner_job_service.cancel_execution(scan.execution_name)
        except ScannerJobError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Failed to cancel scan: {exc}"
            ) from exc

    scan.status = "cancelled"
    await db.commit()

    await log_audit_event(
        user_id=str(user.id), action="scan_cancelled", scan_id=str(scan.id), target_id=str(target.id)
    )
