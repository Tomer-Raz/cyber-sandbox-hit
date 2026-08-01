from pydantic import BaseModel, Field

from app.schemas.scan import SeverityCounts


class TrendPoint(BaseModel):
    label: str
    scans: int = 0
    findings: int = 0
    critical: int = 0


class DashboardStats(BaseModel):
    total_scans: int = 0
    completed_scans: int = 0
    running_scans: int = 0
    total_findings: int = 0
    critical_findings: int = 0
    avg_risk_score: float = 0.0
    trend: list[TrendPoint] = Field(default_factory=list)
    severity_totals: SeverityCounts = Field(default_factory=SeverityCounts)
