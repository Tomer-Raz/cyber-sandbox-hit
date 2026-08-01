from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardStats, TrendPoint
from app.schemas.scan import ScanOut, SeverityCounts
from app.services import finding_stats_service, scan_view_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_ACTIVE_STATUSES = ("pending", "running")

_TREND_DAYS = 7


@router.get("", response_model=DashboardStats)
async def get_dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    rows = await scan_view_service.load_owned_scan_rows(user, db)
    scans = await scan_view_service.build_scan_outs(rows)

    totals = finding_stats_service.empty_counts()
    for scan in scans:
        for severity in finding_stats_service.SEVERITIES:
            totals[severity] += getattr(scan.counts, severity)

    completed = [s for s in scans if s.status == "completed"]
    avg_risk = round(sum(s.risk_score for s in completed) / len(completed), 1) if completed else 0.0

    return DashboardStats(
        total_scans=len(scans),
        completed_scans=len(completed),
        running_scans=len([s for s in scans if s.status in _ACTIVE_STATUSES]),
        total_findings=sum(totals.values()),
        critical_findings=totals["critical"],
        avg_risk_score=avg_risk,
        trend=_build_trend(scans),
        severity_totals=SeverityCounts(**totals),
    )


def _build_trend(scans: list[ScanOut]) -> list[TrendPoint]:
    """One point per day for the last `_TREND_DAYS`, oldest first.

    Days with no scans are still emitted — a gap in the x-axis would read as
    missing data rather than a quiet week.
    """
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=offset) for offset in range(_TREND_DAYS - 1, -1, -1)]
    points: OrderedDict[str, TrendPoint] = OrderedDict(
        (day.isoformat(), TrendPoint(label=day.strftime("%b %d"))) for day in days
    )

    for scan in scans:
        key = scan.created_at.astimezone(timezone.utc).date().isoformat()
        point = points.get(key)
        if point is None:
            continue
        point.scans += 1
        point.findings += scan.total_findings
        point.critical += scan.counts.critical

    return list(points.values())
