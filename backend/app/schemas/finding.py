from pydantic import BaseModel, Field


class ZapFinding(BaseModel):
    """A single raw alert as reported by the ZAP REST API."""

    plugin_id: str
    name: str
    risk: str  # ZAP's own rating: High/Medium/Low/Informational
    confidence: str | None = None
    description: str = ""
    url: str = ""
    param: str | None = None
    evidence: str | None = None
    cwe_id: int | None = None
    solution: str | None = None


class FindingAnalysis(BaseModel):
    """Vertex AI's enrichment of a single finding."""

    cve_ids: list[str] = Field(default_factory=list)
    severity: str
    cvss_score: float
    summary: str
    remediation: str
    cached: bool = False


class AnalyzeFindingsResult(BaseModel):
    scan_id: str
    findings: list[FindingAnalysis]
