import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.scan import SCAN_STATUSES

_SCAN_TYPES = ("baseline", "full")


class ScanOptions(BaseModel):
    """The scan toggles the SPA sends (`frontend/src/types/index.ts`).

    Spelled out rather than accepted as a free-form dict: the previous `dict`
    took arbitrary JSON of any size and stored it on every scan, and nothing
    ever read it back. Unknown keys are dropped here instead of persisted.
    """

    activeScan: bool = False
    ajaxSpider: bool = False
    aiCveMatching: bool = False
    exploitValidation: bool = False
    maxDepth: int = Field(default=5, ge=1, le=20)


class ScanCreate(BaseModel):
    target_id: uuid.UUID
    scan_type: str = Field(default="baseline", pattern="^(" + "|".join(_SCAN_TYPES) + ")$")
    options: ScanOptions = Field(default_factory=ScanOptions)


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # No config_id: it is the scan_configs primary key, an internal join handle
    # the SPA never renders. No error_message either — the column is never
    # written, and a failure surfaces as an event in the scan's log instead.
    status: str = Field(pattern="^(" + "|".join(SCAN_STATUSES) + ")$")
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
    is_anomaly: bool = False


class ScanEvent(BaseModel):
    """One line of a scan's execution log, oldest first."""

    timestamp: datetime
    action: str
    message: str = ""
    level: str = "info"


class ScanStatusOut(BaseModel):
    scan: ScanOut
    events: list[ScanEvent] = Field(default_factory=list)
