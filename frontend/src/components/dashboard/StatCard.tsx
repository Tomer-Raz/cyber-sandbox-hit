import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CountUp } from '@/components/ui/CountUp'

type Tone = 'accent' | 'critical' | 'low' | 'medium'

const TONE: Record<Tone, string> = {
  accent: 'text-accent',
  critical: 'text-critical',
  low: 'text-low',
  medium: 'text-medium',
}

interface StatCardProps {
  label: string
  value: number
  icon: IconName
  tone?: Tone
  hint?: string
  decimals?: number
  suffix?: string
  delay?: number
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'accent',
  hint,
  decimals = 0,
  suffix,
  delay = 0,
}: StatCardProps) {
  return (
    <div
      className="panel group relative overflow-hidden p-5 opacity-0 shadow-panel [animation-fill-mode:forwards] motion-safe:animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        <span
          className={cn(
            'grid size-9 place-items-center rounded-lg border border-line bg-surface-2',
            TONE[tone],
          )}
        >
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="mt-3 nums font-display text-[2rem] font-bold leading-none text-ink">
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
      <span
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30',
          tone === 'critical' ? 'bg-critical' : tone === 'low' ? 'bg-low' : 'bg-accent',
        )}
      />
    </div>
  )
}
