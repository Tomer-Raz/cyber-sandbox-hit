import uuid
from datetime import datetime

from pydantic import BaseModel, Field


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


class ScanReport(BaseModel):
    scan_id: uuid.UUID
    status: str
    target_url: str
    scan_type: str
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    findings: list[ReportFinding] = Field(default_factory=list)
