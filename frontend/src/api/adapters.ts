// ============================================================
//  Backend DTOs -> UI models.
//
//  The FastAPI service speaks snake_case and its own scan
//  vocabulary; the SPA's types were written against the mock
//  engine. Everything that reconciles the two lives here, so
//  no page or store has to know which backend it is talking to.
// ============================================================

import type {
  AiInsight,
  CategoryCount,
  Confidence,
  Finding,
  PhaseKey,
  Scan,
  ScanEvent,
  ScanReport,
  ScanStatus,
  ScanType,
  Severity,
  SeverityCounts,
} from '@/types'

// ── Wire shapes (mirror backend/app/schemas) ──────────────
export interface ApiSeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface ApiScan {
  id: string
  config_id: string
  status: string
  error_message: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  target_url: string
  scan_type: string
  region: string
  counts: ApiSeverityCounts
  total_findings: number
  risk_score: number
}

export interface ApiScanEvent {
  timestamp: string
  action: string
  level: string
}

export interface ApiFinding {
  name: string
  risk: string
  confidence: string | null
  description: string
  url: string
  param: string | null
  evidence: string | null
  cwe_id: number | null
  solution: string | null
  cve_ids: string[]
  severity: string
  cvss_score: number
  summary: string
  remediation: string
}

export interface ApiScanReport {
  scan_id: string
  status: string
  target_url: string
  scan_type: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  findings: ApiFinding[]
  counts: ApiSeverityCounts
  total_findings: number
  risk_score: number
  events: ApiScanEvent[]
  ai: {
    headline: string
    summary: string
    top_risks: string[]
    confidence: number
    model: string
  }
}

export interface ApiDashboard {
  total_scans: number
  completed_scans: number
  running_scans: number
  total_findings: number
  critical_findings: number
  avg_risk_score: number
  trend: Array<{ label: string; scans: number; findings: number; critical: number }>
  severity_totals: ApiSeverityCounts
}

const STATUS_MAP: Record<string, ScanStatus> = {
  pending: 'queued',
  running: 'scanning',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'canceled',
}

const PROGRESS: Record<ScanStatus, number> = {
  queued: 5,
  provisioning: 20,
  scanning: 55,
  analyzing: 70,
  validating: 85,
  reporting: 95,
  completed: 100,
  failed: 100,
  canceled: 100,
}

/** The SPA offers four scan types; the scanner job implements two. */
const SCAN_TYPE_MAP: Record<string, ScanType> = {
  baseline: 'baseline',
  quick: 'quick',
  full: 'full',
  api: 'api',
}

export function toApiScanType(scanType: ScanType): 'baseline' | 'full' {
  return scanType === 'baseline' || scanType === 'quick' ? 'baseline' : 'full'
}

function mapStatus(status: string): ScanStatus {
  return STATUS_MAP[status] ?? 'queued'
}

function mapPhase(status: ScanStatus): PhaseKey {
  if (status === 'completed') return 'completed'
  if (status === 'queued') return 'queued'
  return 'scanning'
}

function mapSeverity(severity: string): Severity {
  const value = severity.trim().toLowerCase()
  if (value === 'informational' || value === 'information') return 'info'
  return (['critical', 'high', 'medium', 'low', 'info'] as Severity[]).includes(value as Severity)
    ? (value as Severity)
    : 'info'
}

function mapConfidence(confidence: string | null): Confidence {
  switch ((confidence ?? '').toLowerCase()) {
    case 'confirmed':
    case 'high':
      return 'confirmed'
    case 'medium':
      return 'firm'
    default:
      return 'tentative'
  }
}

function counts(source: ApiSeverityCounts): SeverityCounts {
  return {
    critical: source.critical,
    high: source.high,
    medium: source.medium,
    low: source.low,
    info: source.info,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function durationSec(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt) return null
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
}

// Mappers 
export function toScan(dto: ApiScan): Scan {
  const status = mapStatus(dto.status)
  return {
    id: dto.id,
    name: hostOf(dto.target_url),
    target: dto.target_url,
    scanType: SCAN_TYPE_MAP[dto.scan_type] ?? 'baseline',
    status,
    progress: PROGRESS[status],
    phase: mapPhase(status),
    createdAt: dto.created_at,
    startedAt: dto.started_at,
    completedAt: dto.finished_at,
    durationSec: durationSec(dto.started_at, dto.finished_at),
    counts: counts(dto.counts),
    totalFindings: dto.total_findings,
    riskScore: Math.round(dto.risk_score),
    // Scans are always listed for their own owner, so the SPA fills this in from the session rather than the API repeating it on every row
    requestedBy: '',
    authorized: true,
    region: dto.region,
  }
}

const EVENT_LEVELS: Record<string, ScanEvent['level']> = {
  info: 'info',
  success: 'success',
  warn: 'warn',
  error: 'error',
}

export function toScanEvent(dto: ApiScanEvent, index: number): ScanEvent {
  return {
    id: `${dto.timestamp}-${index}`,
    ts: dto.timestamp,
    phase: 'scanning',
    level: EVENT_LEVELS[dto.level] ?? 'info',
    message: dto.action.replace(/_/g, ' '),
  }
}

export function toFinding(dto: ApiFinding, scanId: string, index: number): Finding {
  return {
    id: `${scanId}-${index}`,
    scanId,
    name: dto.name,
    severity: mapSeverity(dto.severity),
    cvss: dto.cvss_score,
    cveIds: dto.cve_ids,
    cweId: dto.cwe_id != null ? `CWE-${dto.cwe_id}` : '',
    category: dto.risk || 'Uncategorised',
    endpoint: dto.url,
    // ZAP alerts don't carry the request method through the AI analysis step.
    method: 'GET',
    confidence: mapConfidence(dto.confidence),
    validated: mapConfidence(dto.confidence) === 'confirmed',
    description: dto.description || dto.summary,
    evidence: dto.evidence ?? '',
    recommendation: dto.remediation || dto.solution || '',
    references: [],
    discoveredAt: new Date().toISOString(),
  }
}

export function toScanReport(dto: ApiScanReport): ScanReport {
  const findings = dto.findings.map((f, i) => toFinding(f, dto.scan_id, i))

  const byCategory = new Map<string, number>()
  for (const finding of findings) {
    byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1)
  }
  const findingsByCategory: CategoryCount[] = [...byCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const ai: AiInsight = {
    headline: dto.ai.headline,
    summary: dto.ai.summary,
    topRisks: dto.ai.top_risks,
    confidence: dto.ai.confidence,
    model: dto.ai.model,
  }

  const scan = toScan({
    id: dto.scan_id,
    config_id: '',
    status: dto.status,
    error_message: null,
    created_at: dto.created_at,
    started_at: dto.started_at,
    finished_at: dto.finished_at,
    target_url: dto.target_url,
    scan_type: dto.scan_type,
    region: '',
    counts: dto.counts,
    total_findings: dto.total_findings,
    risk_score: dto.risk_score,
  })

  return {
    scan,
    findings,
    events: dto.events.map(toScanEvent),
    ai,
    findingsByCategory,
  }
}

export function toDashboardStats(dto: ApiDashboard) {
  return {
    totalScans: dto.total_scans,
    completedScans: dto.completed_scans,
    runningScans: dto.running_scans,
    totalFindings: dto.total_findings,
    criticalFindings: dto.critical_findings,
    avgRiskScore: dto.avg_risk_score,
    trend: dto.trend,
    severityTotals: counts(dto.severity_totals),
  }
}
