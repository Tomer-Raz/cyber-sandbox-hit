import { cn } from '@/lib/cn'
import { SEVERITY_META, STATUS_META } from '@/lib/constants'
import type { Confidence, ScanStatus, Severity } from '@/types'

export interface BadgeProps {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

const SIZE = {
  sm: 'h-5 px-2 text-[0.62rem]',
  md: 'h-6 px-2.5 text-[0.7rem]',
}

export function Badge({ children, className, size = 'md' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-mono font-medium uppercase tracking-wider',
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ className, pulse }: { className?: string; pulse?: boolean }) {
  return (
    <span className="relative flex size-1.5">
      {pulse && (
        <span
          className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', className)}
        />
      )}
      <span className={cn('relative inline-flex size-1.5 rounded-full', className)} />
    </span>
  )
}

export function SeverityBadge({
  severity,
  size = 'md',
  withDot = true,
}: {
  severity: Severity
  size?: 'sm' | 'md'
  withDot?: boolean
}) {
  const m = SEVERITY_META[severity]
  return (
    <Badge size={size} className={cn(m.bg, m.border, m.text)}>
      {withDot && <Dot className={m.dot} />}
      {m.label}
    </Badge>
  )
}

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: ScanStatus
  size?: 'sm' | 'md'
}) {
  const m = STATUS_META[status]
  return (
    <Badge size={size} className={cn(m.bg, m.border, m.text)}>
      <Dot className={m.dot} pulse={m.pulse} />
      {m.label}
    </Badge>
  )
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const map: Record<Confidence, string> = {
    confirmed: 'text-low border-low/40 bg-low/10',
    firm: 'text-info border-info/40 bg-info/10',
    tentative: 'text-muted border-line-strong bg-faint/10',
  }
  return (
    <Badge size="sm" className={map[confidence]}>
      {confidence}
    </Badge>
  )
}
