import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'text-bg bg-accent-sheen shadow-glow-sm hover:brightness-110 active:brightness-95 font-semibold',
  secondary:
    'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2/70',
  outline: 'border border-accent/45 text-accent hover:bg-accent/10',
  danger: 'bg-critical/15 text-critical border border-critical/40 hover:bg-critical/25',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8rem] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[0.95rem] gap-2.5 rounded-xl',
}

const ICON_SIZE: Record<Size, number> = { sm: 15, md: 17, lg: 19 }

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
    'transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  )
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
  to?: string
  href?: string
  type?: 'button' | 'submit' | 'reset'
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  fullWidth,
  to,
  href,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = buttonClasses(variant, size, cn(fullWidth && 'w-full', className))
  const is = ICON_SIZE[size]

  const content = (
    <>
      {loading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        iconLeft && <Icon name={iconLeft} size={is} />
      )}
      {children && <span className="truncate">{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} size={is} />}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={cls} {...(rest as any)}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={cls} {...(rest as any)}>
        {content}
      </a>
    )
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  )
}
