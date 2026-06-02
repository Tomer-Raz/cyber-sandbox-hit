import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  eyebrow?: React.ReactNode
  icon?: IconName
  actions?: React.ReactNode
  padded?: boolean
  hover?: boolean
  bodyClassName?: string
}

export function Card({
  title,
  eyebrow,
  icon,
  actions,
  padded = true,
  hover = false,
  className,
  bodyClassName,
  children,
  ...rest
}: CardProps) {
  const hasHeader = title || eyebrow || actions
  return (
    <div
      className={cn(
        'panel relative overflow-hidden shadow-panel',
        hover && 'transition-colors hover:border-line-strong',
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && (
              <h3 className="flex items-center gap-2 font-display text-[0.98rem] font-semibold text-ink">
                {icon && <Icon name={icon} size={17} className="text-accent" />}
                <span className="truncate">{title}</span>
              </h3>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && 'p-5', bodyClassName)}>{children}</div>
    </div>
  )
}
