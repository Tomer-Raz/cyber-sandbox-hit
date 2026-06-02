import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { isRunning, SCAN_TYPE_META, SEVERITY_META, STATUS_META } from '@/lib/constants'
import { formatDuration, formatRelativeTime, riskBand } from '@/lib/format'
import type { Scan } from '@/types'
import { StatusBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SeverityBar } from '@/components/dashboard/SeverityBar'

export function ScanCard({ scan, index = 0 }: { scan: Scan; index?: number }) {
  const meta = SCAN_TYPE_META[scan.scanType]
  const to = scan.status === 'completed' ? `/scans/${scan.id}/report` : `/scans/${scan.id}`
  const running = isRunning(scan.status)
  const band = riskBand(scan.riskScore)
  const bandMeta = SEVERITY_META[band.tone]

  return (
    <Link
      to={to}
      className="panel group relative block overflow-hidden p-4 opacity-0 shadow-panel transition-colors [animation-fill-mode:forwards] hover:border-line-strong motion-safe:animate-fade-up"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-accent">
          <Icon name={meta.icon} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{scan.name}</h3>
            <StatusBadge status={scan.status} size="sm" />
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted">
            <Icon name="globe" size={13} className="shrink-0 text-faint" />
            <span className="truncate">{scan.target}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {running ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className={cn('font-mono uppercase tracking-wider', STATUS_META[scan.status].text)}>
                {STATUS_META[scan.status].label}
              </span>
              <span className="nums font-mono text-muted">{scan.progress}%</span>
            </div>
            <ProgressBar value={scan.progress} height={6} />
          </div>
        ) : scan.status === 'completed' ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SeverityBar counts={scan.counts} height={6} />
              <div className="mt-2 text-xs text-muted">
                <span className="nums font-semibold text-ink">{scan.totalFindings}</span> findings
              </div>
            </div>
            <div className={cn('flex flex-col items-end rounded-lg border px-2.5 py-1', bandMeta.border, bandMeta.bg)}>
              <span className={cn('nums font-display text-lg font-bold leading-none', bandMeta.text)}>
                {scan.riskScore}
              </span>
              <span className="font-mono text-[0.56rem] uppercase tracking-widest2 text-faint">risk</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-muted">
            <Icon
              name={scan.status === 'failed' ? 'alert-triangle' : 'x'}
              size={14}
              className={scan.status === 'failed' ? 'text-critical' : 'text-faint'}
            />
            {scan.status === 'failed' ? 'Scan failed before completion' : 'Scan canceled'}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 pt-3 font-mono text-[0.66rem] text-faint">
        <span className="text-muted">{meta.label}</span>
        <span className="size-0.5 rounded-full bg-faint" />
        <span>{scan.region}</span>
        <span className="size-0.5 rounded-full bg-faint" />
        <span>{formatRelativeTime(scan.createdAt)}</span>
        {scan.durationSec != null && (
          <>
            <span className="size-0.5 rounded-full bg-faint" />
            <span className="flex items-center gap-1">
              <Icon name="clock" size={11} />
              {formatDuration(scan.durationSec)}
            </span>
          </>
        )}
        <Icon
          name="arrow-right"
          size={14}
          className="ml-auto text-faint transition-all group-hover:translate-x-0.5 group-hover:text-accent"
        />
      </div>
    </Link>
  )
}
