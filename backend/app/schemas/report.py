import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.scan import ScanEvent, SeverityCounts


class ReportFinding(BaseModel):
    name: str
    risk: str
    confidence: str | None = None
    description: str = ""
    url: str = ""
    param: str | None = None
    evidence: str | None = None
    cwe_id: int | None = None
    solution: str | None = None
    cve_ids: list[str] = Field(default_factory=list)
    severity: str
    cvss_score: float
    summary: str
    remediation: str


class ReportAiInsight(BaseModel):
    """Roll-up of the Vertex AI per-finding analysis stored in Firestore.

    `summary` is verbatim model output for the highest-severity finding —
    everything else here is counted from the stored findings, not generated.
    """

    headline: str = ""
    summary: str = ""
    top_risks: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    model: str = ""


class ScanReport(BaseModel):
    scan_id: uuid.UUID
    status: str
    target_url: str
    scan_type: str
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    findings: list[ReportFinding] = Field(default_factory=list)
    counts: SeverityCounts = Field(default_factory=SeverityCounts)
    total_findings: int = 0
    risk_score: float = 0.0
    events: list[ScanEvent] = Field(default_factory=list)
    ai: ReportAiInsight = Field(default_factory=ReportAiInsight)
