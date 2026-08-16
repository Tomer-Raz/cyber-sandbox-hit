// Domain models shared across the SPA; shapes mirror the FastAPI contract.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type ScanStatus =
  | 'queued'
  | 'provisioning'
  | 'scanning'
  | 'analyzing'
  | 'validating'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'canceled'

export type ScanType = 'baseline' | 'quick' | 'full' | 'api'

/** The statuses a scan passes through; the terminal failure states are not phases. */
export type PhaseKey = Exclude<ScanStatus, 'failed' | 'canceled'>

export type Confidence = 'confirmed' | 'firm' | 'tentative'

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface Scan {
  id: string
  name: string
  target: string
  scanType: ScanType
  status: ScanStatus
  progress: number // 0..100
  phase: PhaseKey
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  durationSec: number | null
  counts: SeverityCounts
  totalFindings: number
  riskScore: number // 0..100
  requestedBy: string
  authorized: boolean
  region: string
}

export interface ReferenceLink {
  label: string
  url: string
}

export interface Finding {
  id: string
  scanId: string
  name: string
  severity: Severity
  cvss: number
  cveIds: string[]
  cweId: string
  category: string
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  confidence: Confidence
  validated: boolean
  description: string
  evidence: string
  recommendation: string
  references: ReferenceLink[]
  discoveredAt: string
}

export interface ScanEvent {
  id: string
  ts: string
  phase: PhaseKey
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface AiInsight {
  headline: string
  summary: string
  topRisks: string[]
  confidence: number // 0..1
  model: string
}

export interface AnomalyFeature {
  name: string
  value: number
  mean: number
  stdev: number
  zScore: number
}

export interface Anomaly {
  evaluated: boolean
  isAnomaly: boolean
  score: number
  sampleSize: number
  reason: string
  features: AnomalyFeature[]
}

export interface CategoryCount {
  category: string
  count: number
}

export interface ScanReport {
  scan: Scan
  findings: Finding[]
  events: ScanEvent[]
  ai: AiInsight
  anomaly: Anomaly
  findingsByCategory: CategoryCount[]
}

export interface ScanOptions {
  activeScan: boolean
  ajaxSpider: boolean
  aiCveMatching: boolean
  exploitValidation: boolean
  maxDepth: number
}

export interface ScanRequest {
  name: string
  target: string
  scanType: ScanType
  options: ScanOptions
  authorized: boolean
}

export interface TrendPoint {
  label: string
  findings: number
  scans: number
  critical: number
}

export interface DashboardStats {
  totalScans: number
  completedScans: number
  runningScans: number
  totalFindings: number
  criticalFindings: number
  avgRiskScore: number
  trend: TrendPoint[]
  severityTotals: SeverityCounts
}

export interface AppUser {
  id: string
  name: string
  email: string
  role: string
  initials: string
}

export const ADMIN_ROLE = 'admin'

/** Identity is owned by the Google account and role by GCP IAM; only `blockedAt` is ours. */
export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  scanCount: number
  lastScanAt: string | null
  lastLoginAt: string | null
  blockedAt: string | null
}

/** One entry from the audit trail. `details` varies by action, so it stays untyped. */
export interface ActivityEvent {
  action: string
  timestamp: string | null
  details: Record<string, unknown>
}

export interface AdminUserDetail extends AdminUser {
  blockedByEmail: string | null
  targetCount: number
  firstScanAt: string | null
  activity: ActivityEvent[]
  signIns: ActivityEvent[]
}

/** A scan row from the admin view, where `requestedBy` is often someone else. */
export interface AdminScan extends Scan {
  requestedByEmail: string
}
