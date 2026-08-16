import type {
  ActivityEvent,
  AdminScan,
  AdminUser,
  AdminUserDetail,
  AiInsight,
  Anomaly,
  AnomalyFeature,
  DashboardStats,
  Finding,
  PhaseKey,
  Scan,
  ScanEvent,
  ScanReport,
  ScanRequest,
  ScanStatus,
  Severity,
  SeverityCounts,
  TrendPoint,
} from '@/types'
import { SCAN_TYPE_META, SEVERITY_ORDER, isRunning } from '@/lib/constants'
import { clamp, groupByCategory } from '@/lib/format'
import { intBetween, pick, sample, seededRng } from '@/lib/prng'
import { VULN_CATALOG, type VulnTemplate } from './catalog'

interface ScanRecord {
  id: string
  name: string
  target: string
  scanType: Scan['scanType']
  createdAt: number
  startedAt: number | null
  simDurationMs: number
  baseStatus: 'completed' | 'running' | 'queued' | 'failed' | 'canceled'
  region: string
  requestedBy: string
  authorized: boolean
  exploitValidation: boolean
}

const NOW = Date.now()
const SEC = 1000
const MIN = 60 * SEC

const REQUESTERS = ['John Doe', 'A. Cohen', 'M. Levi', 'Security Bot']
const REGIONS = ['europe-west1', 'europe-west4', 'us-central1']

let counter = 1042
function nextId(): string {
  counter += 7
  return `scn_${counter.toString(36).padStart(5, '0')}`
}

// [id, name, target, type, createdAgo, startDelay, duration, region, requestedBy, status?]
type Seed = [string, string, string, Scan['scanType'], number, number, number, string, string, ScanRecord['baseStatus']?]

// Exploit validation is what separates the deep scan types from the shallow ones.
const SEEDS: Seed[] = [
  ['scn_demo01', 'Production storefront — full sweep', 'https://shop.acme-demo.com', 'full', 34 * SEC, 16 * SEC, 52 * SEC, 'europe-west1', 'John Doe', 'running'],
  ['scn_a1f04', 'Customer API gateway', 'https://api.acme-demo.com', 'api', 3 * 60 * MIN, 20 * SEC, 11 * MIN, 'europe-west1', 'John Doe'],
  ['scn_b7c21', 'Marketing site baseline', 'https://www.acme-demo.com', 'baseline', 26 * 60 * MIN, 8 * SEC, 3 * MIN, 'europe-west4', 'A. Cohen'],
  ['scn_c3d88', 'Internal billing service', 'https://billing.internal.acme-demo.com', 'full', 27 * 60 * MIN, 15 * SEC, 24 * MIN, 'europe-west1', 'M. Levi'],
  ['scn_d9e12', 'Auth service — quick check', 'https://auth.acme-demo.com', 'quick', 50 * 60 * MIN, 10 * SEC, 8 * MIN, 'us-central1', 'John Doe'],
  ['scn_e1a55', 'Staging — regression scan', 'https://staging.acme-demo.com', 'quick', 2 * 24 * 60 * MIN, 12 * SEC, 7 * MIN, 'europe-west4', 'Security Bot', 'failed'],
  ['scn_f2b77', 'Partner portal', 'https://partners.acme-demo.com', 'full', 3 * 24 * 60 * MIN, 18 * SEC, 22 * MIN, 'europe-west1', 'A. Cohen'],
  ['scn_g4c19', 'Docs portal baseline', 'https://docs.acme-demo.com', 'baseline', 5 * 24 * 60 * MIN, 6 * SEC, 3 * MIN, 'us-central1', 'M. Levi'],
]

const records: ScanRecord[] = SEEDS.map(
  ([id, name, target, scanType, ago, delay, simDurationMs, region, requestedBy, baseStatus]) => ({
    id,
    name,
    target,
    scanType,
    createdAt: NOW - ago,
    startedAt: NOW - ago + delay,
    simDurationMs,
    baseStatus: baseStatus ?? 'completed',
    region,
    requestedBy,
    authorized: true,
    exploitValidation: scanType === 'full' || scanType === 'api',
  }),
)

function phaseForFraction(frac: number): PhaseKey {
  if (frac >= 1) return 'completed'
  if (frac >= 0.94) return 'reporting'
  if (frac >= 0.82) return 'validating'
  if (frac >= 0.65) return 'analyzing'
  if (frac >= 0.1) return 'scanning'
  return 'provisioning'
}

function originOf(target: string): string {
  if (/^https?:\/\//i.test(target)) return target.replace(/\/+$/, '')
  return `https://${target.replace(/\/+$/, '')}`
}

// Per scan type: severities the policy can surface, finding-count range, and
// how long the simulated run takes.
const PROFILE: Record<
  Scan['scanType'],
  { severities: Severity[]; count: [number, number]; simMs: number }
> = {
  baseline: { severities: ['medium', 'low', 'info'], count: [4, 7], simMs: 34 * SEC },
  quick: { severities: ['high', 'medium', 'low', 'info'], count: [6, 10], simMs: 40 * SEC },
  api: { severities: SEVERITY_ORDER, count: [8, 13], simMs: 44 * SEC },
  full: { severities: SEVERITY_ORDER, count: [13, 19], simMs: 48 * SEC },
}

function scoreFromCounts(c: SeverityCounts): number {
  const raw = c.critical * 23 + c.high * 12 + c.medium * 5 + c.low * 1.5
  return clamp(Math.round(raw), c.critical + c.high + c.medium + c.low > 0 ? 8 : 2, 99)
}

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
}

function buildFindings(rec: ScanRecord): Finding[] {
  const rng = seededRng(rec.id + '|findings')
  const { severities, count } = PROFILE[rec.scanType]
  const allowed = new Set(severities)
  const pool: VulnTemplate[] = VULN_CATALOG.filter((t) => allowed.has(t.severity))
  const n = Math.min(intBetween(rng, ...count), pool.length)
  const chosen = sample(rng, pool, n)
  const origin = originOf(rec.target)
  const started = rec.startedAt ?? rec.createdAt
  const span = rec.simDurationMs

  return chosen
    .map((tpl, i): Finding => {
      const path = pick(rng, tpl.paths)
      const method = pick(rng, tpl.methods)
      const validated =
        rec.exploitValidation && (tpl.severity === 'critical' || tpl.severity === 'high')
      const confidence = validated ? 'confirmed' : tpl.baseConfidence
      const discoveredAt = new Date(started + (0.15 + 0.7 * rng()) * span).toISOString()
      return {
        id: `${rec.id}-f${(i + 1).toString().padStart(2, '0')}`,
        scanId: rec.id,
        name: tpl.name,
        severity: tpl.severity,
        cvss: tpl.cvss,
        cveIds: tpl.cveIds,
        cweId: tpl.cweId,
        category: tpl.category,
        endpoint: origin + path,
        method,
        confidence,
        validated,
        description: tpl.description,
        evidence: tpl.evidence,
        recommendation: tpl.recommendation,
        references: tpl.references,
        discoveredAt,
      }
    })
    .sort((a, b) => b.cvss - a.cvss)
}

function countsFromFindings(findings: Finding[]): SeverityCounts {
  const c = emptyCounts()
  for (const f of findings) c[f.severity] += 1
  return c
}

/** Statuses that don't advance with the simulated clock. */
const FROZEN: Partial<
  Record<ScanRecord['baseStatus'], { status: ScanStatus; phase: PhaseKey; progress: number; frac: number }>
> = {
  queued: { status: 'queued', phase: 'queued', progress: 0, frac: 0 },
  failed: { status: 'failed', phase: 'scanning', progress: 38, frac: 0.4 },
  canceled: { status: 'canceled', phase: 'scanning', progress: 22, frac: 0.25 },
}

function currentFraction(rec: ScanRecord): number {
  const frozen = FROZEN[rec.baseStatus]
  if (frozen) return frozen.frac
  if (rec.baseStatus === 'completed') return 1
  const started = rec.startedAt ?? rec.createdAt
  return clamp((Date.now() - started) / rec.simDurationMs, 0, 1)
}

function projectScan(rec: ScanRecord): Scan {
  const frozen = FROZEN[rec.baseStatus]
  const started = rec.startedAt ?? rec.createdAt
  // Derived from the clock even when baseStatus is already 'completed', so a
  // scan never reports done before its simulated window has elapsed.
  const frac = frozen ? frozen.frac : clamp((Date.now() - started) / rec.simDurationMs, 0, 1)
  const phase = frozen ? frozen.phase : phaseForFraction(frac)
  const progress = frozen ? frozen.progress : Math.round(frac * 100)
  const status: ScanStatus = frozen ? frozen.status : (phase as ScanStatus)
  // A frozen scan stops where it died; a live one only has an end once it reaches 1.
  const completedAt = frac > 0 && (frozen || frac >= 1) ? started + rec.simDurationMs * frac : null

  const isDone = status === 'completed'
  const findings = isDone ? buildFindings(rec) : []
  const counts = isDone ? countsFromFindings(findings) : emptyCounts()
  const durationSec =
    completedAt && rec.startedAt ? Math.round((completedAt - rec.startedAt) / 1000) : null

  return {
    id: rec.id,
    name: rec.name,
    target: rec.target,
    scanType: rec.scanType,
    status,
    progress,
    phase,
    createdAt: new Date(rec.createdAt).toISOString(),
    startedAt: rec.startedAt ? new Date(rec.startedAt).toISOString() : null,
    completedAt: completedAt ? new Date(completedAt).toISOString() : null,
    durationSec,
    counts,
    totalFindings: findings.length,
    riskScore: isDone ? scoreFromCounts(counts) : 0,
    requestedBy: rec.requestedBy,
    authorized: rec.authorized,
    region: rec.region,
  }
}

interface EventTpl {
  at: number
  phase: PhaseKey
  level: ScanEvent['level']
  msg: (ctx: EventCtx) => string
}
interface EventCtx {
  rec: ScanRecord
  findings: Finding[]
  counts: SeverityCounts
}

const EVENT_SCRIPT: EventTpl[] = [
  { at: 0.0, phase: 'provisioning', level: 'info', msg: (c) => `Scan request accepted · correlation ${c.rec.id}` },
  { at: 0.02, phase: 'provisioning', level: 'info', msg: () => `Pulling scanner image from Artifact Registry · zap:latest` },
  { at: 0.06, phase: 'provisioning', level: 'success', msg: (c) => `Cloud Run job provisioned in ${c.rec.region}` },
  { at: 0.1, phase: 'scanning', level: 'info', msg: (c) => `OWASP ZAP daemon online · policy ${SCAN_TYPE_META[c.rec.scanType].policy}` },
  { at: 0.16, phase: 'scanning', level: 'info', msg: (c) => `Spider crawling ${originOf(c.rec.target)}` },
  { at: 0.32, phase: 'scanning', level: 'info', msg: (c) => `Spider mapped ${28 + (c.findings.length % 7) * 11} URLs · ${4 + (c.findings.length % 5)} forms` },
  { at: 0.46, phase: 'scanning', level: 'warn', msg: () => `Active scan in progress · injecting probes` },
  { at: 0.62, phase: 'scanning', level: 'success', msg: (c) => `Active scan complete · ${c.findings.length + 6} raw alerts` },
  { at: 0.67, phase: 'analyzing', level: 'info', msg: () => `Streaming findings to Vertex AI` },
  { at: 0.78, phase: 'analyzing', level: 'success', msg: (c) => `CVE matching complete · ${c.findings.filter((f) => f.cveIds.length).length} CVEs correlated` },
  { at: 0.85, phase: 'validating', level: 'info', msg: () => `Launching exploit validators for high-risk findings` },
  { at: 0.92, phase: 'validating', level: 'success', msg: (c) => `${c.findings.filter((f) => f.validated).length} findings confirmed · false positives pruned` },
  { at: 0.96, phase: 'reporting', level: 'info', msg: () => `Aggregating report artefacts` },
  { at: 0.99, phase: 'reporting', level: 'info', msg: () => `Tearing down ephemeral container` },
  { at: 1.0, phase: 'completed', level: 'success', msg: (c) => `Scan complete · ${c.findings.length} findings · risk ${scoreFromCounts(c.counts)}` },
]

export function buildEvents(rec: ScanRecord, upToFrac = 1): ScanEvent[] {
  const findings = buildFindings(rec)
  const counts = countsFromFindings(findings)
  const ctx: EventCtx = { rec, findings, counts }
  const started = rec.startedAt ?? rec.createdAt

  if (rec.baseStatus === 'failed') {
    const base = EVENT_SCRIPT.filter((e) => e.at <= 0.4)
    const evts = base.map((e, i) => toEvent(rec, e, ctx, started, i))
    evts.push({
      id: `${rec.id}-ev-err`,
      ts: new Date(started + rec.simDurationMs * 0.4).toISOString(),
      phase: 'scanning',
      level: 'error',
      message: 'Scan aborted · target returned 502 from upstream gateway',
    })
    return evts
  }

  return EVENT_SCRIPT.filter((e) => e.at <= upToFrac + 1e-9).map((e, i) =>
    toEvent(rec, e, ctx, started, i),
  )
}

function toEvent(
  rec: ScanRecord,
  e: EventTpl,
  ctx: EventCtx,
  started: number,
  i: number,
): ScanEvent {
  return {
    id: `${rec.id}-ev${i.toString().padStart(2, '0')}`,
    ts: new Date(started + e.at * rec.simDurationMs).toISOString(),
    phase: e.phase,
    level: e.level,
    message: e.msg(ctx),
  }
}

function buildInsight(scan: Scan, findings: Finding[]): AiInsight {
  const top = findings.slice(0, 3).map((f) => f.name)
  const crit = scan.counts.critical
  const high = scan.counts.high
  const headline =
    crit > 0
      ? `${crit} critical exposure${crit > 1 ? 's' : ''} require immediate action`
      : high > 0
        ? `Elevated risk — ${high} high-severity issue${high > 1 ? 's' : ''} found`
        : 'No critical exposures — hardening opportunities remain'
  return {
    headline,
    summary: `Vertex AI correlated ${findings.filter((f) => f.cveIds.length).length} findings to known CVEs across ${new Set(findings.map((f) => f.category)).size} categories. ${
      crit + high > 0
        ? 'Injection and access-control weaknesses dominate the risk profile and should be remediated first.'
        : 'Remaining items are configuration and hardening gaps with limited direct impact.'
    }`,
    topRisks: top,
    confidence: 0.78 + (findings.length % 5) * 0.03,
    model: 'vertex-gemini-cve',
  }
}

const ANOMALY_MIN_SAMPLE_SIZE = 5
const ANOMALY_Z_SCORE_THRESHOLD = 3.0

/** Mirrors backend/app/services/anomaly_service.py's leave-one-out z-score. */
function buildAnomaly(rec: ScanRecord, scan: Scan): Anomaly {
  const history = records
    .filter((r) => r.id !== rec.id && r.target === rec.target && r.baseStatus === 'completed')
    .map(projectScan)

  if (history.length < ANOMALY_MIN_SAMPLE_SIZE) {
    return {
      evaluated: false,
      isAnomaly: false,
      score: 0,
      sampleSize: history.length,
      reason: 'insufficient_history',
      features: [],
    }
  }

  const feature = (name: string, value: number, values: number[]): AnomalyFeature => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
    const stdev = Math.sqrt(variance)
    return { name, value, mean, stdev, zScore: stdev === 0 ? 0 : (value - mean) / stdev }
  }

  const features = [
    feature('total_findings', scan.totalFindings, history.map((s) => s.totalFindings)),
    feature('risk_score', scan.riskScore, history.map((s) => s.riskScore)),
    feature('duration_seconds', scan.durationSec ?? 0, history.map((s) => s.durationSec ?? 0)),
  ]

  const score = Math.max(...features.map((f) => Math.abs(f.zScore)))
  return {
    evaluated: true,
    isAnomaly: score >= ANOMALY_Z_SCORE_THRESHOLD,
    score,
    sampleSize: history.length,
    reason: '',
    features,
  }
}

function buildReport(rec: ScanRecord): ScanReport {
  const scan = projectScan(rec)
  const findings = buildFindings(rec)
  return {
    scan,
    findings,
    events: buildEvents(rec, currentFraction(rec)),
    ai: buildInsight(scan, findings),
    anomaly: buildAnomaly(rec, scan),
    findingsByCategory: groupByCategory(findings),
  }
}

export function listScans(): Scan[] {
  return records
    .map(projectScan)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function getScanRecord(id: string): ScanRecord | undefined {
  return records.find((r) => r.id === id)
}

export function getScan(id: string): Scan | undefined {
  const rec = getScanRecord(id)
  return rec ? projectScan(rec) : undefined
}

export function getStatusPayload(id: string): { scan: Scan; events: ScanEvent[] } | undefined {
  const rec = getScanRecord(id)
  if (!rec) return undefined
  return { scan: projectScan(rec), events: buildEvents(rec, currentFraction(rec)) }
}

export function getReport(id: string): ScanReport | undefined {
  const rec = getScanRecord(id)
  return rec ? buildReport(rec) : undefined
}

export function createScan(req: ScanRequest): Scan {
  const rec: ScanRecord = {
    id: nextId(),
    name: req.name || `${SCAN_TYPE_META[req.scanType].label} scan · ${req.target}`,
    target: req.target,
    scanType: req.scanType,
    createdAt: Date.now(),
    startedAt: Date.now() + 400,
    simDurationMs: PROFILE[req.scanType].simMs,
    baseStatus: 'running',
    region: pick(seededRng(req.target + Date.now()), REGIONS),
    requestedBy: REQUESTERS[0],
    authorized: req.authorized,
    exploitValidation: req.options.exploitValidation,
  }
  records.unshift(rec)
  return projectScan(rec)
}

export function cancelScan(id: string): Scan | undefined {
  const rec = getScanRecord(id)
  if (!rec) return undefined
  rec.baseStatus = 'canceled'
  rec.simDurationMs = Math.max(1, Date.now() - (rec.startedAt ?? rec.createdAt))
  return projectScan(rec)
}

export function dashboardStats(): DashboardStats {
  const scans = records.map(projectScan)
  const completed = scans.filter((s) => s.status === 'completed')

  const severityTotals = emptyCounts()
  let totalFindings = 0
  for (const s of completed) {
    for (const key of SEVERITY_ORDER) severityTotals[key] += s.counts[key]
    totalFindings += s.totalFindings
  }

  // 7-day trend from completed scans, bucketed by day.
  const dayMs = 24 * 60 * MIN
  const trend: TrendPoint[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = NOW - (6 - i) * dayMs
    const inDay = completed.filter((s) => {
      const t = new Date(s.completedAt ?? s.createdAt).getTime()
      return t >= dayStart - dayMs / 2 && t < dayStart + dayMs / 2
    })
    return {
      label: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }),
      scans: inDay.length,
      findings: inDay.reduce((a, s) => a + s.totalFindings, 0),
      critical: inDay.reduce((a, s) => a + s.counts.critical, 0),
    }
  })

  return {
    totalScans: scans.length,
    completedScans: completed.length,
    runningScans: scans.filter((s) => isRunning(s.status)).length,
    totalFindings,
    criticalFindings: severityTotals.critical,
    avgRiskScore: completed.length
      ? Math.round(completed.reduce((a, s) => a + s.riskScore, 0) / completed.length)
      : 0,
    trend,
    severityTotals,
  }
}

// Mock mode has no user table, so the roster is derived from the seeded scans.
function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@hit.ac.il`
}

export function adminScans(): AdminScan[] {
  return listScans().map((scan) => ({ ...scan, requestedByEmail: emailFor(scan.requestedBy) }))
}

const DAY_MS = 24 * 60 * MIN

// Block state is the one thing the mock has to remember across calls, since
// blocking and then re-reading the roster has to agree with itself.
const blockedAtById = new Map<string, string>()

export function adminUsers(): AdminUser[] {
  const scans = listScans()
  return REQUESTERS.map((name, i) => {
    const theirs = scans.filter((s) => s.requestedBy === name)
    const lastScanAt = theirs.reduce<string | null>(
      (latest, s) => (!latest || s.createdAt > latest ? s.createdAt : latest),
      null,
    )
    const id = `usr_${(i + 1).toString().padStart(4, '0')}`
    return {
      id,
      name,
      email: emailFor(name),
      // Mirrors the real backend: exactly one allowlisted admin.
      role: i === 0 ? 'admin' : 'user',
      createdAt: new Date(NOW - (30 + i * 12) * DAY_MS).toISOString(),
      scanCount: theirs.length,
      lastScanAt,
      lastLoginAt: new Date(NOW - (i * 3 + 1) * 40 * MIN).toISOString(),
      blockedAt: blockedAtById.get(id) ?? null,
    }
  })
}

export function adminUser(id: string): AdminUserDetail | undefined {
  const user = adminUsers().find((u) => u.id === id)
  if (!user) return undefined

  const theirs = listScans().filter((s) => s.requestedBy === user.name)
  const firstScanAt = theirs.reduce<string | null>(
    (earliest, s) => (!earliest || s.createdAt < earliest ? s.createdAt : earliest),
    null,
  )

  const activity: ActivityEvent[] = theirs.slice(0, 12).map((s) => ({
    action: s.status === 'canceled' ? 'scan_cancelled' : 'scan_started',
    timestamp: s.createdAt,
    details: { scan_id: s.id, target: s.target },
  }))
  if (user.blockedAt) {
    activity.unshift({
      action: 'user_blocked',
      timestamp: user.blockedAt,
      details: { actor_email: emailFor(REQUESTERS[0]) },
    })
  }

  const signIns: ActivityEvent[] = Array.from({ length: 6 }, (_, n) => ({
    action: 'signed_in',
    timestamp: new Date(NOW - (n * 19 + 1) * 40 * MIN).toISOString(),
    details: { email: user.email },
  }))

  return {
    ...user,
    blockedByEmail: user.blockedAt ? emailFor(REQUESTERS[0]) : null,
    targetCount: new Set(theirs.map((s) => s.target)).size,
    firstScanAt,
    activity: activity.sort((a, b) => (a.timestamp! < b.timestamp! ? 1 : -1)),
    signIns,
  }
}

export function setAdminUserBlocked(id: string, blocked: boolean): AdminUser | undefined {
  const user = adminUsers().find((u) => u.id === id)
  if (!user) return undefined
  if (blocked) blockedAtById.set(id, new Date().toISOString())
  else blockedAtById.delete(id)
  return { ...user, blockedAt: blockedAtById.get(id) ?? null }
}
