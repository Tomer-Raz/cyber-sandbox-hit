// ============================================================
//  Domain models — shared across the SPA.
//  (Shapes are designed to mirror a future FastAPI contract.)
// ============================================================

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

export type PhaseKey =
  | 'queued'
  | 'provisioning'
  | 'scanning'
  | 'analyzing'
  | 'validating'
  | 'reporting'
  | 'completed'

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

export interface CategoryCount {
  category: string
  count: number
}

export interface ScanReport {
  scan: Scan
  findings: Finding[]
  events: ScanEvent[]
  ai: AiInsight
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
  org: string
  initials: string
}
