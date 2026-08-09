import type { PhaseKey, ScanEvent, ScanStatus, ScanType, Severity } from '@/types'

/** Seed for antd's `colorPrimary`; read the derived value via `theme.useToken()`. */
export const ACCENT_HEX = '#1677ff'
export const APP_NAME = 'Sandbox Playground'
export const APP_TAGLINE = 'Autonomous Pentest Console'

// ── Severity ──────────────────────────────────────────────
/** `hex` is the light-theme chart fill (see `useSeverityHex`), `tag` the antd Tag preset. */
export interface SeverityMeta {
  label: string
  hex: string
  tag: string
  rank: number
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  critical: { label: 'Critical', hex: '#cf1322', tag: 'red', rank: 5 },
  high: { label: 'High', hex: '#fa541c', tag: 'volcano', rank: 4 },
  medium: { label: 'Medium', hex: '#faad14', tag: 'gold', rank: 3 },
  low: { label: 'Low', hex: '#52c41a', tag: 'green', rank: 2 },
  info: { label: 'Info', hex: ACCENT_HEX, tag: 'blue', rank: 1 },
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

// ── Scan type ─────────────────────────────────────────────
export interface ScanTypeMeta {
  label: string
  tagline: string
  description: string
  estMinutes: string
  policy: string
  tag: string
}

export const SCAN_TYPE_META: Record<ScanType, ScanTypeMeta> = {
  baseline: {
    label: 'Baseline',
    tagline: 'Passive · safe',
    description: 'Passive spider + alert baseline. No active payloads sent to the target.',
    estMinutes: '~3 min',
    policy: 'ZAP Baseline',
    tag: 'green',
  },
  quick: {
    label: 'Quick',
    tagline: 'Light active',
    description: 'Spider plus a fast active scan of the most common injection points.',
    estMinutes: '~8 min',
    policy: 'ZAP Quick',
    tag: 'blue',
  },
  full: {
    label: 'Full DAST',
    tagline: 'Deep · active',
    description: 'AJAX spider, full active scan, AI CVE matching and exploit validation.',
    estMinutes: '~25 min',
    policy: 'ZAP Full + Exploit',
    tag: 'volcano',
  },
  api: {
    label: 'API Scan',
    tagline: 'OpenAPI aware',
    description: 'Import an OpenAPI/GraphQL definition and fuzz every documented endpoint.',
    estMinutes: '~12 min',
    policy: 'ZAP API',
    tag: 'geekblue',
  },
}

export const SCAN_TYPES: ScanType[] = ['baseline', 'quick', 'full', 'api']

// ── Lifecycle phases (antd Steps) ─────────────────────────
export const PHASES: { key: PhaseKey; label: string; description: string }[] = [
  {
    key: 'provisioning',
    label: 'Provisioning',
    description: 'Spinning up an ephemeral Cloud Run job from the registry.',
  },
  {
    key: 'scanning',
    label: 'Scanning',
    description: 'OWASP ZAP runs active & passive scans against the target.',
  },
  {
    key: 'analyzing',
    label: 'AI Analysis',
    description: 'Vertex AI matches raw findings to known CVEs.',
  },
  {
    key: 'validating',
    label: 'Validation',
    description: 'Exploit scripts confirm vulnerabilities and cut false positives.',
  },
  {
    key: 'reporting',
    label: 'Reporting',
    description: 'Aggregating results and tearing the container back down.',
  },
]

// ── Status ────────────────────────────────────────────────
export const STATUS_META: Record<ScanStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'default' },
  provisioning: { label: 'Provisioning', color: 'processing' },
  scanning: { label: 'Scanning', color: 'processing' },
  analyzing: { label: 'AI Analysis', color: 'processing' },
  validating: { label: 'Validating', color: 'processing' },
  reporting: { label: 'Reporting', color: 'processing' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  canceled: { label: 'Canceled', color: 'default' },
}

export const TERMINAL_STATUSES: ScanStatus[] = ['completed', 'failed', 'canceled']

export function isRunning(status: ScanStatus): boolean {
  return !TERMINAL_STATUSES.includes(status)
}

// ── Event levels ──────────────────────────────────────────
/**
 * `timeline` is an antd Timeline preset; `severity`/`glyph` drive the raw log
 * view. `severity` maps a level onto the severity palette so the log picks up
 * theme-correct colors; omitting it means "plain body text".
 */
export const EVENT_LEVEL_META: Record<
  ScanEvent['level'],
  { timeline: string; severity?: Severity; glyph: string }
> = {
  info: { timeline: 'blue', glyph: '›' },
  success: { timeline: 'green', severity: 'low', glyph: '✓' },
  warn: { timeline: 'orange', severity: 'medium', glyph: '⚠' },
  error: { timeline: 'red', severity: 'critical', glyph: '✗' },
}
