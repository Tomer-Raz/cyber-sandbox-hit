import { cn } from '@/lib/cn'

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-accent/30 border-t-accent',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label="Loading"
      role="status"
    />
  )
}

export function LoaderBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Spinner size={24} />
      <span className="font-mono text-xs uppercase tracking-widest2">{label}</span>
    </div>
  )
}
