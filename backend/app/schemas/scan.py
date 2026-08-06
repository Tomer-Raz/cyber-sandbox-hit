import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.scan import SCAN_STATUSES

_SCAN_TYPES = ("baseline", "full")


class ScanCreate(BaseModel):
    target_id: uuid.UUID
    scan_type: str = Field(default="baseline", pattern="^(" + "|".join(_SCAN_TYPES) + ")$")
    options: dict = Field(default_factory=dict)


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    config_id: uuid.UUID
    status: str = Field(pattern="^(" + "|".join(SCAN_STATUSES) + ")$")
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None

    # Denormalised from scan_configs/targets and from the Firestore findings
    # so the SPA can render a scan row without an N+1 of follow-up calls.
    target_url: str = ""
    scan_type: str = "baseline"
    region: str = ""
    counts: SeverityCounts = Field(default_factory=SeverityCounts)
    total_findings: int = 0
    risk_score: float = 0.0


class ScanEvent(BaseModel):
    """One line of a scan's execution log, oldest first."""

    timestamp: datetime
    action: str
    message: str = ""
    level: str = "info"


class ScanStatusOut(BaseModel):
    scan: ScanOut
    events: list[ScanEvent] = Field(default_factory=list)
