import type {
  AiInsight,
  CategoryCount,
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
import { SCAN_TYPE_META } from '@/lib/constants'
import { clamp } from '@/lib/format'
import { intBetween, pick, sample, seededRng } from '@/lib/prng'
import { VULN_CATALOG, type VulnTemplate } from './catalog'

// ── Internal record (source of truth) ─────────────────────
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

const REQUESTERS = ['Tomer Raz', 'A. Cohen', 'M. Levi', 'Security Bot']
const REGIONS = ['West Europe', 'North Europe', 'East US 2']

let counter = 1042
function nextId(): string {
  counter += 7
  return `scn_${counter.toString(36).padStart(5, '0')}`
}

// ── Seed dataset ──────────────────────────────────────────
const records: ScanRecord[] = [
  {
    id: 'scn_demo01',
    name: 'Production storefront — full sweep',
    target: 'https://shop.acme-demo.com',
    scanType: 'full',
    createdAt: NOW - 34 * SEC,
    startedAt: NOW - 18 * SEC,
    simDurationMs: 52 * SEC,
    baseStatus: 'running',
    region: 'West Europe',
    requestedBy: 'Tomer Raz',
    authorized: true,
    exploitValidation: true,
  },
  {
    id: 'scn_a1f04',
    name: 'Customer API gateway',
    target: 'https://api.acme-demo.com',
    scanType: 'api',
    createdAt: NOW - 3 * 60 * MIN,
    startedAt: NOW - 3 * 60 * MIN + 20 * SEC,
    simDurationMs: 11 * MIN,
    baseStatus: 'completed',
    region: 'West Europe',
    requestedBy: 'Tomer Raz',
    authorized: true,
    exploitValidation: true,
  },
  {
    id: 'scn_b7c21',
    name: 'Marketing site baseline',
    target: 'https://www.acme-demo.com',
    scanType: 'baseline',
    createdAt: NOW - 26 * 60 * MIN,
    startedAt: NOW - 26 * 60 * MIN + 8 * SEC,
    simDurationMs: 3 * MIN,
    baseStatus: 'completed',
    region: 'North Europe',
    requestedBy: 'A. Cohen',
    authorized: true,
    exploitValidation: false,
  },
  {
    id: 'scn_c3d88',
    name: 'Internal billing service',
    target: 'https://billing.internal.acme-demo.com',
    scanType: 'full',
    createdAt: NOW - 27 * 60 * MIN,
    startedAt: NOW - 27 * 60 * MIN + 15 * SEC,
    simDurationMs: 24 * MIN,
    baseStatus: 'completed',
    region: 'West Europe',
    requestedBy: 'M. Levi',
    authorized: true,
    exploitValidation: true,
  },
  {
    id: 'scn_d9e12',
    name: 'Auth service — quick check',
    target: 'https://auth.acme-demo.com',
    scanType: 'quick',
    createdAt: NOW - 50 * 60 * MIN,
    startedAt: NOW - 50 * 60 * MIN + 10 * SEC,
    simDurationMs: 8 * MIN,
    baseStatus: 'completed',
    region: 'East US 2',
    requestedBy: 'Tomer Raz',
    authorized: true,
    exploitValidation: false,
  },
  {
    id: 'scn_e1a55',
    name: 'Staging — regression scan',
    target: 'https://staging.acme-demo.com',
    scanType: 'quick',
    createdAt: NOW - 2 * 24 * 60 * MIN,
    startedAt: NOW - 2 * 24 * 60 * MIN + 12 * SEC,
    simDurationMs: 7 * MIN,
    baseStatus: 'failed',
    region: 'North Europe',
    requestedBy: 'Security Bot',
    authorized: true,
    exploitValidation: false,
  },
  {
    id: 'scn_f2b77',
    name: 'Partner portal',
    target: 'https://partners.acme-demo.com',
    scanType: 'full',
    createdAt: NOW - 3 * 24 * 60 * MIN,
    startedAt: NOW - 3 * 24 * 60 * MIN + 18 * SEC,
    simDurationMs: 22 * MIN,
    baseStatus: 'completed',
    region: 'West Europe',
    requestedBy: 'A. Cohen',
    authorized: true,
    exploitValidation: true,
  },
  {
    id: 'scn_g4c19',
    name: 'Docs portal baseline',
    target: 'https://docs.acme-demo.com',
    scanType: 'baseline',
    createdAt: NOW - 5 * 24 * 60 * MIN,
    startedAt: NOW - 5 * 24 * 60 * MIN + 6 * SEC,
    simDurationMs: 3 * MIN,
    baseStatus: 'completed',
    region: 'East US 2',
    requestedBy: 'M. Levi',
    authorized: true,
    exploitValidation: false,
  },
]

// ── Time-derived phase / progress ─────────────────────────
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

function allowedSeverities(type: Scan['scanType']): Severity[] {
  switch (type) {
    case 'baseline':
      return ['medium', 'low', 'info']
    case 'quick':
      return ['high', 'medium', 'low', 'info']
    default:
      return ['critical', 'high', 'medium', 'low', 'info']
  }
}

function findingCount(type: Scan['scanType'], rng: () => number): number {
  switch (type) {
    case 'baseline':
      return intBetween(rng, 4, 7)
    case 'quick':
      return intBetween(rng, 6, 10)
    case 'api':
      return intBetween(rng, 8, 13)
    default:
      return intBetween(rng, 13, 19)
  }
}

function scoreFromCounts(c: SeverityCounts): number {
  const raw = c.critical * 23 + c.high * 12 + c.medium * 5 + c.low * 1.5
  return clamp(Math.round(raw), c.critical + c.high + c.medium + c.low > 0 ? 8 : 2, 99)
}

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
}

// ── Findings (deterministic per scan) ─────────────────────
function buildFindings(rec: ScanRecord): Finding[] {
  const rng = seededRng(rec.id + '|findings')
  const allowed = new Set(allowedSeverities(rec.scanType))
  const pool: VulnTemplate[] = VULN_CATALOG.filter((t) => allowed.has(t.severity))
  const n = Math.min(findingCount(rec.scanType, rng), pool.length)
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

// ── Live projection: record → Scan ────────────────────────
export function projectScan(rec: ScanRecord): Scan {
  let status: ScanStatus
  let progress: number
  let phase: PhaseKey
  let completedAt: number | null = null

  if (rec.baseStatus === 'queued') {
    status = 'queued'
    progress = 0
    phase = 'queued'
  } else if (rec.baseStatus === 'failed') {
    status = 'failed'
    progress = 38
    phase = 'scanning'
    completedAt = (rec.startedAt ?? rec.createdAt) + rec.simDurationMs * 0.4
  } else if (rec.baseStatus === 'canceled') {
    status = 'canceled'
    progress = 22
    phase = 'scanning'
    completedAt = (rec.startedAt ?? rec.createdAt) + rec.simDurationMs * 0.25
  } else {
    // running or completed — derive from the simulated clock
    const started = rec.startedAt ?? rec.createdAt
    const frac = clamp((Date.now() - started) / rec.simDurationMs, 0, 1)
    phase = phaseForFraction(frac)
    progress = Math.round(frac * 100)
    if (frac >= 1) {
      status = 'completed'
      completedAt = started + rec.simDurationMs
    } else {
      status = phase as ScanStatus
    }
  }

  const isDone = status === 'completed'
  const findings = isDone ? buildFindings(rec) : []
  const counts = isDone ? countsFromFindings(findings) : emptyCounts()
  const started = rec.startedAt
  const durationSec =
    completedAt && started ? Math.round((completedAt - started) / 1000) : null

  return {
    id: rec.id,
    name: rec.name,
    target: rec.target,
    scanType: rec.scanType,
    status,
    progress,
    phase,
    createdAt: new Date(rec.createdAt).toISOString(),
    startedAt: started ? new Date(started).toISOString() : null,
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

// ── Event timeline ────────────────────────────────────────
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
  { at: 0.02, phase: 'provisioning', level: 'info', msg: () => `Pulling scanner image from ACR · zap-win:latest` },
  { at: 0.06, phase: 'provisioning', level: 'success', msg: (c) => `ACI container provisioned in ${c.rec.region}` },
  { at: 0.1, phase: 'scanning', level: 'info', msg: (c) => `OWASP ZAP daemon online · policy ${SCAN_TYPE_META[c.rec.scanType].policy}` },
  { at: 0.16, phase: 'scanning', level: 'info', msg: (c) => `Spider crawling ${originOf(c.rec.target)}` },
  { at: 0.32, phase: 'scanning', level: 'info', msg: (c) => `Spider mapped ${28 + (c.findings.length % 7) * 11} URLs · ${4 + (c.findings.length % 5)} forms` },
  { at: 0.46, phase: 'scanning', level: 'warn', msg: () => `Active scan in progress · injecting probes` },
  { at: 0.62, phase: 'scanning', level: 'success', msg: (c) => `Active scan complete · ${c.findings.length + 6} raw alerts` },
  { at: 0.67, phase: 'analyzing', level: 'info', msg: () => `Streaming findings to Azure AI Foundry` },
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

function currentFraction(rec: ScanRecord): number {
  if (rec.baseStatus === 'completed') return 1
  if (rec.baseStatus === 'queued') return 0
  if (rec.baseStatus === 'failed') return 0.4
  if (rec.baseStatus === 'canceled') return 0.25
  const started = rec.startedAt ?? rec.createdAt
  return clamp((Date.now() - started) / rec.simDurationMs, 0, 1)
}

// ── AI insight (deterministic narrative) ──────────────────
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
    summary: `Foundry correlated ${findings.filter((f) => f.cveIds.length).length} findings to known CVEs across ${new Set(findings.map((f) => f.category)).size} categories. ${
      crit + high > 0
        ? 'Injection and access-control weaknesses dominate the risk profile and should be remediated first.'
        : 'Remaining items are configuration and hardening gaps with limited direct impact.'
    }`,
    topRisks: top,
    confidence: 0.78 + (findings.length % 5) * 0.03,
    model: 'foundry-gpt-4o-cve',
  }
}

// ── Public report assembly ────────────────────────────────
export function buildReport(rec: ScanRecord): ScanReport {
  const scan = projectScan(rec)
  const findings = scan.status === 'completed' ? buildFindings(rec) : buildFindings(rec)
  const byCat = new Map<string, number>()
  for (const f of findings) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1)
  const findingsByCategory: CategoryCount[] = [...byCat.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return {
    scan,
    findings,
    events: buildEvents(rec, currentFraction(rec)),
    ai: buildInsight(scan, findings),
    findingsByCategory,
  }
}

// ── Collection accessors ──────────────────────────────────
export function listScans(): Scan[] {
  return records
    .map(projectScan)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getScanRecord(id: string): ScanRecord | undefined {
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
  const meta = SCAN_TYPE_META[req.scanType]
  const simByType: Record<string, number> = {
    baseline: 34 * SEC,
    quick: 40 * SEC,
    api: 44 * SEC,
    full: 48 * SEC,
  }
  const rec: ScanRecord = {
    id: nextId(),
    name: req.name || `${meta.label} scan · ${req.target}`,
    target: req.target,
    scanType: req.scanType,
    createdAt: Date.now(),
    startedAt: Date.now() + 400,
    simDurationMs: simByType[req.scanType] ?? 42 * SEC,
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

// ── Dashboard aggregation ─────────────────────────────────
export function dashboardStats(): DashboardStats {
  const scans = records.map(projectScan)
  const completed = scans.filter((s) => s.status === 'completed')
  const running = scans.filter((s) =>
    ['queued', 'provisioning', 'scanning', 'analyzing', 'validating', 'reporting'].includes(
      s.status,
    ),
  )

  const severityTotals: SeverityCounts = emptyCounts()
  let totalFindings = 0
  for (const s of completed) {
    severityTotals.critical += s.counts.critical
    severityTotals.high += s.counts.high
    severityTotals.medium += s.counts.medium
    severityTotals.low += s.counts.low
    severityTotals.info += s.counts.info
    totalFindings += s.totalFindings
  }

  const avgRiskScore = completed.length
    ? Math.round(completed.reduce((a, s) => a + s.riskScore, 0) / completed.length)
    : 0

  // 7-day trend built from completed scans, bucketed by day
  const dayMs = 24 * 60 * MIN
  const trend: TrendPoint[] = []
  for (let d = 6; d >= 0; d--) {
    const dayStart = NOW - d * dayMs
    const label = new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' })
    const inDay = completed.filter((s) => {
      const t = new Date(s.completedAt ?? s.createdAt).getTime()
      return t >= dayStart - dayMs / 2 && t < dayStart + dayMs / 2
    })
    trend.push({
      label,
      scans: inDay.length,
      findings: inDay.reduce((a, s) => a + s.totalFindings, 0),
      critical: inDay.reduce((a, s) => a + s.counts.critical, 0),
    })
  }

  return {
    totalScans: scans.length,
    completedScans: completed.length,
    runningScans: running.length,
    totalFindings,
    criticalFindings: severityTotals.critical,
    avgRiskScore,
    trend,
    severityTotals,
  }
}
