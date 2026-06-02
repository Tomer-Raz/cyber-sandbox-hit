import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-[length:200%_100%]',
        '[background-image:linear-gradient(90deg,rgb(var(--c-surface-2))_0%,rgb(var(--c-surface-3))_50%,rgb(var(--c-surface-2))_100%)]',
        className,
      )}
    />
  )
}
