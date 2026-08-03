"""Builds the `ScanOut` payload the SPA renders a scan row from.

Keeps the join (scan -> scan_config -> target) and the Firestore severity
roll-up in one place, so /api/scans, /api/scans/{id} and /api/dashboard all
report identical numbers for the same scan.
"""

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import shared_settings
from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.models.user import User
from app.schemas.scan import ScanOut, SeverityCounts
from app.services import finding_stats_service

ScanRow = tuple[Scan, ScanConfig, Target]
# Same join plus the owning user — the admin views need to say who ran what.
ScanWithUserRow = tuple[Scan, ScanConfig, Target, User]


def owned_scans_query(user: User) -> Select[ScanRow]:
    """Every scan the user owns, joined with its config and target.

    Ownership flows through scan_configs.user_id — see `scan_access`.
    """
    return (
        select(Scan, ScanConfig, Target)
        .join(ScanConfig, ScanConfig.id == Scan.config_id)
        .join(Target, Target.id == ScanConfig.target_id)
        .where(ScanConfig.user_id == user.id)
        .order_by(Scan.created_at.desc())
    )


async def load_owned_scan_rows(user: User, db: AsyncSession) -> list[ScanRow]:
    result = await db.execute(owned_scans_query(user))
    return [(row[0], row[1], row[2]) for row in result.all()]


def all_scans_query() -> Select[ScanWithUserRow]:
    """Every scan in the system, joined with the user who started it.

    The one query in this codebase with no ownership filter — its only caller
    is the admin router, which is gated by `require_admin`.
    """
    return (
        select(Scan, ScanConfig, Target, User)
        .join(ScanConfig, ScanConfig.id == Scan.config_id)
        .join(Target, Target.id == ScanConfig.target_id)
        .join(User, User.id == ScanConfig.user_id)
        .order_by(Scan.created_at.desc())
    )


async def load_all_scan_rows(db: AsyncSession) -> list[ScanWithUserRow]:
    result = await db.execute(all_scans_query())
    return [(row[0], row[1], row[2], row[3]) for row in result.all()]


async def build_scan_outs(rows: list[ScanRow]) -> list[ScanOut]:
    counts_by_scan = await finding_stats_service.severity_counts_by_scan(
        [str(scan.id) for scan, _config, _target in rows]
    )
    return [
        _to_scan_out(scan, config, target, counts_by_scan.get(str(scan.id), {}))
        for scan, config, target in rows
    ]


async def build_scan_out(scan: Scan, target: Target, db: AsyncSession) -> ScanOut:
    config_result = await db.execute(select(ScanConfig).where(ScanConfig.id == scan.config_id))
    config = config_result.scalar_one()
    counts_by_scan = await finding_stats_service.severity_counts_by_scan([str(scan.id)])
    return _to_scan_out(scan, config, target, counts_by_scan.get(str(scan.id), {}))


def _to_scan_out(
    scan: Scan, config: ScanConfig, target: Target, counts: dict[str, int]
) -> ScanOut:
    filled = {**finding_stats_service.empty_counts(), **counts}
    return ScanOut(
        id=scan.id,
        config_id=scan.config_id,
        status=scan.status,
        error_message=scan.error_message,
        created_at=scan.created_at,
        started_at=scan.started_at,
        finished_at=scan.finished_at,
        target_url=target.url,
        scan_type=config.scan_type,
        # Scans always run as a Cloud Run Job in the service's own region.
        region=shared_settings.gcp_region,
        counts=SeverityCounts(**filled),
        total_findings=sum(filled.values()),
        risk_score=finding_stats_service.risk_score(filled),
    )
