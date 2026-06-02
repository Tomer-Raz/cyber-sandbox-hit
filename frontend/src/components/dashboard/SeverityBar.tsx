import { cn } from '@/lib/cn'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import type { SeverityCounts } from '@/types'

export function SeverityBar({
  counts,
  height = 8,
  showLegend = false,
  className,
}: {
  counts: SeverityCounts
  height?: number
  showLegend?: boolean
  className?: string
}) {
  const total = SEVERITY_ORDER.reduce((a, s) => a + counts[s], 0)

  return (
    <div className={className}>
      <div
        className="flex w-full overflow-hidden rounded-full border border-line bg-surface-2"
        style={{ height }}
      >
        {total === 0 ? (
          <div className="w-full bg-faint/15" />
        ) : (
          SEVERITY_ORDER.map((s) =>
            counts[s] > 0 ? (
              <div
                key={s}
                className={cn('h-full', SEVERITY_META[s].dot)}
                style={{ width: `${(counts[s] / total) * 100}%` }}
                title={`${SEVERITY_META[s].label}: ${counts[s]}`}
              />
            ) : null,
          )
        )}
      </div>
      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {SEVERITY_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', SEVERITY_META[s].dot)} />
              <span className="text-xs text-muted">{SEVERITY_META[s].label}</span>
              <span className="nums text-xs font-semibold text-ink">{counts[s]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
