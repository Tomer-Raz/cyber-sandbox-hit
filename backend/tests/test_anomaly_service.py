import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.scan import Scan
from app.models.target import Target
from app.services import anomaly_service, finding_stats_service
from app.services.anomaly_service import assess
from tests.conftest import FakeResult, FakeSession, make


def _row(total_findings, risk_score, duration_seconds):
    return {
        "total_findings": total_findings,
        "risk_score": risk_score,
        "duration_seconds": duration_seconds,
    }


def test_assess_insufficient_history_abstains():
    result = assess(
        {"total_findings": 5.0, "risk_score": 20.0, "duration_seconds": 60.0},
        [_row(4, 15, 55)] * 3,  # only 3, below MIN_SAMPLE_SIZE=5
    )
    assert result.evaluated is False
    assert result.reason == "insufficient_history"
    assert result.sample_size == 3


def test_assess_normal_case_not_anomaly():
    history = [
        _row(5, 20, 60),
        _row(6, 22, 58),
        _row(4, 18, 62),
        _row(5, 21, 59),
        _row(6, 19, 61),
    ]
    result = assess(_row(5, 20, 60), history)
    assert result.evaluated is True
    assert result.is_anomaly is False


def test_assess_flags_single_feature_extreme_outlier():
    # total_findings/risk_score identical to baseline; duration has a little
    # natural variance in history (so stdev != 0) and the current value is
    # wildly outside it.
    history = [_row(5, 20, 58), _row(5, 20, 60), _row(5, 20, 62), _row(5, 20, 59), _row(5, 20, 61)]
    result = assess(_row(5, 20, 6000), history)
    assert result.evaluated is True
    assert result.is_anomaly is True
    duration_feature = next(f for f in result.features if f.name == "duration_seconds")
    assert abs(duration_feature.z_score) == result.score


def test_assess_zero_stdev_history_yields_zero_z_not_dropped():
    history = [_row(5, 20, 60)] * 5  # identical -> stdev == 0 for every feature
    result = assess(_row(5, 20, 60), history)
    assert result.evaluated is True
    assert len(result.features) == 3
    assert all(f.z_score == 0.0 for f in result.features)
    assert result.is_anomaly is False


def test_assess_drops_duration_feature_when_mostly_missing():
    history = [
        _row(5, 20, 60),
        {"total_findings": 6, "risk_score": 22},
        {"total_findings": 4, "risk_score": 18},
        {"total_findings": 5, "risk_score": 21},
        {"total_findings": 6, "risk_score": 19},
    ]
    result = assess(_row(5, 20, 999), history)
    assert result.evaluated is True
    assert {f.name for f in result.features} == {"total_findings", "risk_score"}


@pytest.mark.asyncio
async def test_assess_scan_abstains_when_not_completed():
    target = make(Target, user_id=uuid.uuid4())
    scan = make(Scan, config_id=uuid.uuid4(), status="running")
    result = await anomaly_service.assess_scan(
        scan, target, FakeSession(), current_total_findings=0, current_risk_score=0.0
    )
    assert result.evaluated is False
    assert result.reason == "scan_not_completed"


@pytest.mark.asyncio
async def test_assess_scan_abstains_below_min_sample():
    target = make(Target, user_id=uuid.uuid4())
    scan = make(
        Scan,
        config_id=uuid.uuid4(),
        status="completed",
        started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc),
    )
    session = FakeSession(execute_results=[FakeResult([])])  # no history rows
    result = await anomaly_service.assess_scan(
        scan, target, session, current_total_findings=3, current_risk_score=10.0
    )
    assert result.evaluated is False
    assert result.reason == "insufficient_history"


@pytest.mark.asyncio
async def test_assess_scan_evaluates_with_enough_history(monkeypatch):
    target = make(Target, user_id=uuid.uuid4())
    now = datetime.now(timezone.utc)
    scan = make(
        Scan,
        config_id=uuid.uuid4(),
        status="completed",
        started_at=now,
        finished_at=now + timedelta(seconds=60),
    )
    history = [
        make(
            Scan,
            config_id=uuid.uuid4(),
            status="completed",
            started_at=now,
            finished_at=now + timedelta(seconds=55 + i),
        )
        for i in range(5)
    ]
    session = FakeSession(execute_results=[FakeResult(history)])

    async def fake_counts(scan_ids):
        return {sid: {**finding_stats_service.empty_counts(), "medium": 2} for sid in scan_ids}

    monkeypatch.setattr(finding_stats_service, "severity_counts_by_scan", fake_counts)

    result = await anomaly_service.assess_scan(
        scan, target, session, current_total_findings=2, current_risk_score=10.0
    )
    assert result.evaluated is True
    assert result.sample_size == 5


def _completed_scan(started_at, finished_at):
    return make(
        Scan,
        config_id=uuid.uuid4(),
        status="completed",
        started_at=started_at,
        finished_at=finished_at,
    )


def test_bulk_is_anomaly_flags_only_the_outlier_scan():
    target = make(Target, user_id=uuid.uuid4())
    now = datetime.now(timezone.utc)
    normal = [_completed_scan(now, now + timedelta(seconds=58 + i)) for i in range(5)]
    outlier = _completed_scan(now, now + timedelta(seconds=6000))

    counts_by_scan = {str(s.id): {**finding_stats_service.empty_counts(), "medium": 2} for s in normal}
    counts_by_scan[str(outlier.id)] = {**finding_stats_service.empty_counts(), "medium": 2}

    flags = anomaly_service.bulk_is_anomaly(
        [(s, target) for s in normal] + [(outlier, target)], counts_by_scan
    )
    assert all(flags[s.id] is False for s in normal)
    assert flags[outlier.id] is True


def test_bulk_is_anomaly_ignores_non_completed_scans():
    target = make(Target, user_id=uuid.uuid4())
    now = datetime.now(timezone.utc)
    running = make(Scan, config_id=uuid.uuid4(), status="running", started_at=now, finished_at=None)
    flags = anomaly_service.bulk_is_anomaly([(running, target)], {})
    assert running.id not in flags


def test_bulk_is_anomaly_scopes_history_per_target():
    target_a = make(Target, user_id=uuid.uuid4())
    target_b = make(Target, user_id=uuid.uuid4())
    now = datetime.now(timezone.utc)
    # Only 2 completed scans for target_b -> below MIN_SAMPLE_SIZE, must abstain (False).
    a_scans = [_completed_scan(now, now + timedelta(seconds=58 + i)) for i in range(5)]
    b_scans = [_completed_scan(now, now + timedelta(seconds=100 + i)) for i in range(2)]

    counts_by_scan = {
        str(s.id): {**finding_stats_service.empty_counts(), "medium": 2} for s in a_scans + b_scans
    }
    flags = anomaly_service.bulk_is_anomaly(
        [(s, target_a) for s in a_scans] + [(s, target_b) for s in b_scans], counts_by_scan
    )
    assert all(flags[s.id] is False for s in b_scans)
