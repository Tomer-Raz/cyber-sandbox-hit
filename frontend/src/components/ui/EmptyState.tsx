import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon = 'search', title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="relative mb-5 grid size-16 place-items-center rounded-2xl border border-line bg-surface-2">
        <div className="absolute inset-0 rounded-2xl bg-accent/5" />
        <Icon name={icon} size={26} className="text-accent" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
