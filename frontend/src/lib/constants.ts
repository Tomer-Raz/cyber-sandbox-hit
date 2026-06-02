import type { PhaseKey, ScanStatus, ScanType, Severity } from '@/types'
import type { IconName } from '@/components/ui/Icon'

// ── Severity ──────────────────────────────────────────────
export interface SeverityMeta {
  label: string
  hex: string
  rank: number
  text: string
  bg: string
  border: string
  dot: string
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  critical: {
    label: 'Critical',
    hex: '#FF3D71',
    rank: 5,
    text: 'text-critical',
    bg: 'bg-critical/12',
    border: 'border-critical/40',
    dot: 'bg-critical',
  },
  high: {
    label: 'High',
    hex: '#FF8A3D',
    rank: 4,
    text: 'text-high',
    bg: 'bg-high/12',
    border: 'border-high/40',
    dot: 'bg-high',
  },
  medium: {
    label: 'Medium',
    hex: '#FFC73D',
    rank: 3,
    text: 'text-medium',
    bg: 'bg-medium/12',
    border: 'border-medium/40',
    dot: 'bg-medium',
  },
  low: {
    label: 'Low',
    hex: '#2FE6A0',
    rank: 2,
    text: 'text-low',
    bg: 'bg-low/12',
    border: 'border-low/40',
    dot: 'bg-low',
  },
  info: {
    label: 'Info',
    hex: '#54A8FF',
    rank: 1,
    text: 'text-info',
    bg: 'bg-info/12',
    border: 'border-info/40',
    dot: 'bg-info',
  },
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

export const ACCENT_HEX = '#38E1E8'
export const ACCENT2_HEX = '#4F7DFF'

// ── Scan type ─────────────────────────────────────────────
export interface ScanTypeMeta {
  label: string
  tagline: string
  description: string
  icon: IconName
  estMinutes: string
  policy: string
}

export const SCAN_TYPE_META: Record<ScanType, ScanTypeMeta> = {
  baseline: {
    label: 'Baseline',
    tagline: 'Passive · safe',
    description: 'Passive spider + alert baseline. No active payloads sent to the target.',
    icon: 'radar',
    estMinutes: '~3 min',
    policy: 'ZAP Baseline',
  },
  quick: {
    label: 'Quick',
    tagline: 'Light active',
    description: 'Spider plus a fast active scan of the most common injection points.',
    icon: 'zap',
    estMinutes: '~8 min',
    policy: 'ZAP Quick',
  },
  full: {
    label: 'Full DAST',
    tagline: 'Deep · active',
    description: 'AJAX spider, full active scan, AI CVE matching and exploit validation.',
    icon: 'target',
    estMinutes: '~25 min',
    policy: 'ZAP Full + Exploit',
  },
  api: {
    label: 'API Scan',
    tagline: 'OpenAPI aware',
    description: 'Import an OpenAPI/GraphQL definition and fuzz every documented endpoint.',
    icon: 'layers',
    estMinutes: '~12 min',
    policy: 'ZAP API',
  },
}

// ── Lifecycle phases (stepper / status) ───────────────────
export interface PhaseMeta {
  key: PhaseKey
  label: string
  short: string
  description: string
  icon: IconName
}

export const PHASES: PhaseMeta[] = [
  {
    key: 'provisioning',
    label: 'Provisioning',
    short: 'Provision',
    description: 'Spinning up an ephemeral ACI container from the registry.',
    icon: 'server',
  },
  {
    key: 'scanning',
    label: 'Scanning',
    short: 'Scan',
    description: 'OWASP ZAP runs active & passive scans against the target.',
    icon: 'radar',
  },
  {
    key: 'analyzing',
    label: 'AI Analysis',
    short: 'Analyze',
    description: 'Azure AI Foundry matches raw findings to known CVEs.',
    icon: 'sparkles',
  },
  {
    key: 'validating',
    label: 'Validation',
    short: 'Validate',
    description: 'Exploit scripts confirm vulnerabilities and cut false positives.',
    icon: 'flask',
  },
  {
    key: 'reporting',
    label: 'Reporting',
    short: 'Report',
    description: 'Aggregating results and tearing the container back down.',
    icon: 'file',
  },
]

export const PHASE_FLOW: PhaseKey[] = [
  'queued',
  'provisioning',
  'scanning',
  'analyzing',
  'validating',
  'reporting',
  'completed',
]

// ── Status ────────────────────────────────────────────────
export interface StatusMeta {
  label: string
  text: string
  bg: string
  border: string
  dot: string
  pulse: boolean
}

const RUNNING_STATUSES: ScanStatus[] = [
  'queued',
  'provisioning',
  'scanning',
  'analyzing',
  'validating',
  'reporting',
]

export function isRunning(status: ScanStatus): boolean {
  return RUNNING_STATUSES.includes(status)
}

export const STATUS_META: Record<ScanStatus, StatusMeta> = {
  queued: {
    label: 'Queued',
    text: 'text-muted',
    bg: 'bg-faint/10',
    border: 'border-line-strong',
    dot: 'bg-faint',
    pulse: false,
  },
  provisioning: {
    label: 'Provisioning',
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    dot: 'bg-accent',
    pulse: true,
  },
  scanning: {
    label: 'Scanning',
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    dot: 'bg-accent',
    pulse: true,
  },
  analyzing: {
    label: 'AI Analysis',
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    dot: 'bg-accent',
    pulse: true,
  },
  validating: {
    label: 'Validating',
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    dot: 'bg-accent',
    pulse: true,
  },
  reporting: {
    label: 'Reporting',
    text: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/40',
    dot: 'bg-accent',
    pulse: true,
  },
  completed: {
    label: 'Completed',
    text: 'text-low',
    bg: 'bg-low/12',
    border: 'border-low/40',
    dot: 'bg-low',
    pulse: false,
  },
  failed: {
    label: 'Failed',
    text: 'text-critical',
    bg: 'bg-critical/12',
    border: 'border-critical/40',
    dot: 'bg-critical',
    pulse: false,
  },
  canceled: {
    label: 'Canceled',
    text: 'text-muted',
    bg: 'bg-faint/10',
    border: 'border-line-strong',
    dot: 'bg-faint',
    pulse: false,
  },
}

export const APP_NAME = 'Sandbox Playground'
export const APP_TAGLINE = 'Autonomous Pentest Console'
