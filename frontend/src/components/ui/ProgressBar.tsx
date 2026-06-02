import { cn } from '@/lib/cn'
import { clamp } from '@/lib/format'

interface ProgressBarProps {
  value?: number // 0..100
  indeterminate?: boolean
  className?: string
  height?: number
  glow?: boolean
}

export function ProgressBar({
  value = 0,
  indeterminate = false,
  className,
  height = 8,
  glow = true,
}: ProgressBarProps) {
  const pct = clamp(value, 0, 100)
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full border border-line bg-surface-2/80',
        className,
      )}
      style={{ height }}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* track grid */}
      <div className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(90deg,transparent,transparent_10px,rgb(var(--c-border)/0.6)_10px,rgb(var(--c-border)/0.6)_11px)]" />
      {indeterminate ? (
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent-sheen [animation:marquee_1.2s_ease-in-out_infinite_alternate]" />
      ) : (
        <div
          className={cn(
            'relative h-full rounded-full bg-accent-sheen transition-[width] duration-700 ease-out',
            glow && 'shadow-[0_0_14px_-2px_rgb(var(--c-accent)/0.7)]',
          )}
          style={{ width: `${pct}%` }}
        >
          <span className="absolute inset-y-0 right-0 w-8 bg-white/30 blur-[3px]" />
        </div>
      )}
    </div>
  )
}
