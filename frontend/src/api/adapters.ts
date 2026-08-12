// Backend DTOs (snake_case, backend vocabulary) -> UI models, so no page or
// store has to know which backend it is talking to.

import type {
  ActivityEvent,
  AdminScan,
  AdminUser,
  AdminUserDetail,
  AiInsight,
  Confidence,
  Finding,
  PhaseKey,
  Scan,
  ScanEvent,
  ScanReport,
  ScanStatus,
  ScanType,
  SeverityCounts,
} from '@/types'
import { SCAN_TYPES, SEVERITY_ORDER } from '@/lib/constants'
import { groupByCategory } from '@/lib/format'

// Wire shapes mirror backend/app/schemas.
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
  counts: SeverityCounts
  total_findings: number
  risk_score: number
}

export interface ApiScanEvent {
  timestamp: string
  action: string
  message: string
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
  counts: SeverityCounts
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

export interface ApiAdminUser {
  id: string
  email: string
  name: string
  role: string
  created_at: string
  scan_count: number
  last_scan_at: string | null
  last_login_at: string | null
  blocked_at: string | null
}

export interface ApiActivityEvent {
  action: string
  timestamp: string | null
  details: Record<string, unknown>
}

export interface ApiAdminUserDetail extends ApiAdminUser {
  blocked_by_email: string | null
  target_count: number
  first_scan_at: string | null
  activity: ApiActivityEvent[]
  sign_ins: ApiActivityEvent[]
}

export interface ApiAdminScan extends ApiScan {
  user_id: string
  user_email: string
  user_name: string
}

export interface ApiDashboard {
  total_scans: number
  completed_scans: number
  running_scans: number
  total_findings: number
  critical_findings: number
  avg_risk_score: number
  trend: Array<{ label: string; scans: number; findings: number; critical: number }>
  severity_totals: SeverityCounts
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

const EVENT_LEVELS: ScanEvent['level'][] = ['info', 'success', 'warn', 'error']

/** Narrows a free-form backend string to a known union member. */
function oneOf<T extends string>(allowed: T[], value: string, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** The SPA offers four scan types; the scanner job implements two. */
export function toApiScanType(scanType: ScanType): 'baseline' | 'full' {
  return scanType === 'baseline' || scanType === 'quick' ? 'baseline' : 'full'
}

function mapPhase(status: ScanStatus): PhaseKey {
  return status === 'completed' || status === 'queued' ? status : 'scanning'
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

export function toScan(dto: ApiScan): Scan {
  const status = STATUS_MAP[dto.status] ?? 'queued'
  return {
    id: dto.id,
    name: hostOf(dto.target_url),
    target: dto.target_url,
    scanType: oneOf(SCAN_TYPES, dto.scan_type, 'baseline'),
    status,
    progress: PROGRESS[status],
    phase: mapPhase(status),
    createdAt: dto.created_at,
    startedAt: dto.started_at,
    completedAt: dto.finished_at,
    durationSec: durationSec(dto.started_at, dto.finished_at),
    counts: { ...dto.counts },
    totalFindings: dto.total_findings,
    riskScore: Math.round(dto.risk_score),
    // Owner-scoped lists don't repeat the owner, so the SPA fills it from the session.
    requestedBy: '',
    authorized: true,
    region: dto.region,
  }
}

export function toScanEvent(dto: ApiScanEvent, index: number): ScanEvent {
  return {
    id: `${dto.timestamp}-${index}`,
    ts: dto.timestamp,
    phase: 'scanning',
    level: oneOf(EVENT_LEVELS, dto.level, 'info'),
    message: dto.message || dto.action.replace(/_/g, ' '),
  }
}

function toFinding(dto: ApiFinding, scanId: string, index: number): Finding {
  const confidence = mapConfidence(dto.confidence)
  return {
    id: `${scanId}-${index}`,
    scanId,
    name: dto.name,
    severity: oneOf(SEVERITY_ORDER, dto.severity.trim().toLowerCase(), 'info'),
    cvss: dto.cvss_score,
    cveIds: dto.cve_ids,
    cweId: dto.cwe_id != null ? `CWE-${dto.cwe_id}` : '',
    category: dto.risk || 'Uncategorised',
    endpoint: dto.url,
    // ZAP alerts don't carry the request method through the AI analysis step.
    method: 'GET',
    confidence,
    validated: confidence === 'confirmed',
    description: dto.description || dto.summary,
    evidence: dto.evidence ?? '',
    recommendation: dto.remediation || dto.solution || '',
    references: [],
    discoveredAt: new Date().toISOString(),
  }
}

export function toScanReport(dto: ApiScanReport): ScanReport {
  const findings = dto.findings.map((f, i) => toFinding(f, dto.scan_id, i))

  const ai: AiInsight = {
    headline: dto.ai.headline,
    summary: dto.ai.summary,
    topRisks: dto.ai.top_risks,
    confidence: dto.ai.confidence,
    model: dto.ai.model,
  }

  return {
    scan: toScan({
      ...dto,
      id: dto.scan_id,
      config_id: '',
      error_message: null,
      region: '',
    }),
    findings,
    events: dto.events.map(toScanEvent),
    ai,
    findingsByCategory: groupByCategory(findings),
  }
}

export function toAdminUser(dto: ApiAdminUser): AdminUser {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    createdAt: dto.created_at,
    scanCount: dto.scan_count,
    lastScanAt: dto.last_scan_at,
    lastLoginAt: dto.last_login_at,
    blockedAt: dto.blocked_at,
  }
}

function toActivityEvent(dto: ApiActivityEvent): ActivityEvent {
  return { action: dto.action, timestamp: dto.timestamp, details: dto.details ?? {} }
}

export function toAdminUserDetail(dto: ApiAdminUserDetail): AdminUserDetail {
  return {
    ...toAdminUser(dto),
    blockedByEmail: dto.blocked_by_email,
    targetCount: dto.target_count,
    firstScanAt: dto.first_scan_at,
    activity: (dto.activity ?? []).map(toActivityEvent),
    signIns: (dto.sign_ins ?? []).map(toActivityEvent),
  }
}

export function toAdminScan(dto: ApiAdminScan): AdminScan {
  return {
    ...toScan(dto),
    // The admin view spans users, so the payload carries the owner.
    requestedBy: dto.user_name,
    requestedByEmail: dto.user_email,
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
    severityTotals: { ...dto.severity_totals },
  }
}
