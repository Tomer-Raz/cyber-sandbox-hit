import { cn } from '@/lib/cn'
import { clamp } from '@/lib/format'

interface RadialGaugeProps {
  value: number // 0..100
  size?: number
  thickness?: number
  label?: string
  sublabel?: string
  colorHex?: string
  className?: string
}

export function RadialGauge({
  value,
  size = 132,
  thickness = 10,
  label,
  sublabel,
  colorHex = '#38E1E8',
  className,
}: RadialGaugeProps) {
  const v = clamp(value, 0, 100)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - v / 100)
  const id = `g-${Math.round(r)}-${colorHex.slice(1)}`

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colorHex} />
            <stop offset="100%" stopColor="#4F7DFF" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-border))"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)',
            filter: `drop-shadow(0 0 6px ${colorHex}77)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="nums font-display text-2xl font-bold text-ink">{Math.round(v)}</div>
          {label && (
            <div className="font-mono text-[0.6rem] uppercase tracking-widest2 text-faint">
              {label}
            </div>
          )}
          {sublabel && <div className="mt-0.5 text-xs text-muted">{sublabel}</div>}
        </div>
      </div>
    </div>
  )
}
