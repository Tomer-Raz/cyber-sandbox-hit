import statistics
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.models.scan_config import ScanConfig
from app.models.target import Target
from app.schemas.anomaly import AnomalyFeature, AnomalyOut
from app.services import finding_stats_service

MIN_SAMPLE_SIZE = 5
Z_SCORE_THRESHOLD = 3.0

# total_findings and risk_score are both derived from the same severity
# counts, so they're correlated, not independent evidence — duration_seconds
# is the only feature here that can flag entirely on its own.
_FEATURE_NAMES = ("total_findings", "risk_score", "duration_seconds")


def assess(current: dict[str, float], history: list[dict[str, float]]) -> AnomalyOut:
    """Pure leave-one-out z-score assessment. `history` must already exclude
    the scan being assessed. No DB/Firestore access — unit-test directly.
    """
    sample_size = len(history)
    if sample_size < MIN_SAMPLE_SIZE:
        return AnomalyOut(evaluated=False, reason="insufficient_history", sample_size=sample_size)

    features: list[AnomalyFeature] = []
    for name in _FEATURE_NAMES:
        if name not in current:
            continue
        values = [row[name] for row in history if name in row]
        if len(values) < 2:
            continue
        mean = statistics.mean(values)
        stdev = statistics.stdev(values)
        x = current[name]
        z = 0.0 if stdev == 0 else (x - mean) / stdev
        features.append(AnomalyFeature(name=name, value=x, mean=mean, stdev=stdev, z_score=z))

    if not features:
        return AnomalyOut(evaluated=False, reason="insufficient_history", sample_size=sample_size)

    score = max(abs(f.z_score) for f in features)
    return AnomalyOut(
        evaluated=True,
        is_anomaly=score >= Z_SCORE_THRESHOLD,
        score=score,
        sample_size=sample_size,
        features=features,
    )


async def assess_scan(
    scan: Scan,
    target: Target,
    db: AsyncSession,
    current_total_findings: int,
    current_risk_score: float,
) -> AnomalyOut:
    """DB/Firestore-backed wrapper around `assess`.

    `current_total_findings`/`current_risk_score` are passed in by the caller
    (report_service already derived them from the same findings list) instead
    of being re-fetched here — avoids a second, possibly-inconsistent
    Firestore read for the scan already being reported on.
    """
    if scan.status != "completed":
        return AnomalyOut(evaluated=False, reason="scan_not_completed")

    history_result = await db.execute(
        select(Scan)
        .join(ScanConfig, ScanConfig.id == Scan.config_id)
        .where(
            ScanConfig.target_id == target.id,
            Scan.status == "completed",
            Scan.id != scan.id,
        )
    )
    history_scans = history_result.scalars().all()

    if len(history_scans) < MIN_SAMPLE_SIZE:
        return AnomalyOut(
            evaluated=False, reason="insufficient_history", sample_size=len(history_scans)
        )

    counts_by_scan = await finding_stats_service.severity_counts_by_scan(
        [str(s.id) for s in history_scans]
    )

    history_features = []
    for s in history_scans:
        counts = counts_by_scan.get(str(s.id), finding_stats_service.empty_counts())
        row: dict[str, float] = {
            "total_findings": float(sum(counts.values())),
            "risk_score": finding_stats_service.risk_score(counts),
        }
        if s.started_at and s.finished_at:
            row["duration_seconds"] = (s.finished_at - s.started_at).total_seconds()
        history_features.append(row)

    current_features: dict[str, float] = {
        "total_findings": float(current_total_findings),
        "risk_score": current_risk_score,
    }
    if scan.started_at and scan.finished_at:
        current_features["duration_seconds"] = (scan.finished_at - scan.started_at).total_seconds()

    return assess(current_features, history_features)


def bulk_is_anomaly(
    scans_and_targets: list[tuple[Scan, Target]], counts_by_scan: dict[str, dict[str, int]]
) -> dict[uuid.UUID, bool]:
    """Same leave-one-out z-score as `assess`, batched for a scan list.

    Unlike `assess_scan`, takes no DB session: `scans_and_targets` must already
    include every completed scan for every target being evaluated (true for
    both the owned-scans and admin-scans listings, which are unpaginated), so
    grouping happens in memory instead of one query per scan.
    """
    completed = [(s, t) for s, t in scans_and_targets if s.status == "completed"]
    by_target: dict[uuid.UUID, list[Scan]] = {}
    for scan, target in completed:
        by_target.setdefault(target.id, []).append(scan)

    features: dict[uuid.UUID, dict[str, float]] = {}
    for scan, _target in completed:
        filled = {**finding_stats_service.empty_counts(), **counts_by_scan.get(str(scan.id), {})}
        row: dict[str, float] = {
            "total_findings": float(sum(filled.values())),
            "risk_score": finding_stats_service.risk_score(filled),
        }
        if scan.started_at and scan.finished_at:
            row["duration_seconds"] = (scan.finished_at - scan.started_at).total_seconds()
        features[scan.id] = row

    flags: dict[uuid.UUID, bool] = {}
    for scan, target in completed:
        history = [features[s.id] for s in by_target[target.id] if s.id != scan.id]
        flags[scan.id] = assess(features[scan.id], history).is_anomaly
    return flags
