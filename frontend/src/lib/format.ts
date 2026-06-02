// Formatting helpers — dates, durations, numbers, risk banding.

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = then - Date.now()
  const abs = Math.abs(diff)
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (abs < min) return 'just now'
  if (abs < hour) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour')
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day')
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en').format(n)
}

export function pluralize(n: number, word: string, plural?: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${plural ?? word + 's'}`
}

export interface RiskBand {
  label: string
  tone: 'critical' | 'high' | 'medium' | 'low'
}

export function riskBand(score: number): RiskBand {
  if (score >= 80) return { label: 'Critical', tone: 'critical' }
  if (score >= 55) return { label: 'Elevated', tone: 'high' }
  if (score >= 30) return { label: 'Moderate', tone: 'medium' }
  return { label: 'Low', tone: 'low' }
}

export function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
