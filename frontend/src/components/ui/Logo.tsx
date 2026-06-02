import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

interface BrandMarkProps {
  size?: number
  spinning?: boolean
  className?: string
}

/** Animated brand mark — a shield haloed by a slow conic ring. */
export function BrandMark({ size = 36, spinning = true, className }: BrandMarkProps) {
  return (
    <span
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          'conic-ring absolute inset-0 rounded-[30%] opacity-70 blur-[1px]',
          spinning && 'motion-safe:animate-[spin_6s_linear_infinite]',
        )}
      />
      <span className="absolute inset-[2px] rounded-[28%] bg-bg" />
      <svg
        viewBox="0 0 32 32"
        width={size * 0.62}
        height={size * 0.62}
        className="relative"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38E1E8" />
            <stop offset="100%" stopColor="#4F7DFF" />
          </linearGradient>
        </defs>
        <path d="M16 2 4 7v8c0 7.5 5.1 13 12 15 6.9-2 12-7.5 12-15V7L16 2Z" fill="url(#brand-grad)" />
        <path
          d="m14.7 19.6-3.6-3.6 1.8-1.8 1.8 1.8 4.6-4.6 1.8 1.8-6.4 6.4Z"
          fill="#070A12"
        />
      </svg>
    </span>
  )
}

interface LogoProps {
  to?: string
  showText?: boolean
  size?: number
  className?: string
}

export function Logo({ to = '/', showText = true, size = 36, className }: LogoProps) {
  const inner = (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark size={size} />
      {showText && (
        <span className="leading-none">
          <span className="block font-display text-[0.95rem] font-bold tracking-tightest text-ink">
            SANDBOX
          </span>
          <span className="block font-mono text-[0.62rem] uppercase tracking-widest2 text-accent">
            playground
          </span>
        </span>
      )}
    </span>
  )
  if (to) {
    return (
      <Link to={to} className="inline-flex outline-none focus-visible:opacity-80">
        {inner}
      </Link>
    )
  }
  return inner
}
