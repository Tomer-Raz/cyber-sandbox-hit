import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useUiStore, type Toast, type ToastVariant } from '@/store/uiStore'
import { Icon, type IconName } from './Icon'

const VARIANT: Record<ToastVariant, { icon: IconName; ring: string; text: string }> = {
  success: { icon: 'check-circle', ring: 'border-low/40', text: 'text-low' },
  error: { icon: 'alert-octagon', ring: 'border-critical/40', text: 'text-critical' },
  warning: { icon: 'alert-triangle', ring: 'border-medium/40', text: 'text-medium' },
  info: { icon: 'info', ring: 'border-accent/40', text: 'text-accent' },
}

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast)
  const v = VARIANT[toast.variant]

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.duration)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={cn(
        'panel pointer-events-auto flex w-80 items-start gap-3 border px-4 py-3 shadow-panel',
        v.ring,
      )}
    >
      <Icon name={v.icon} size={18} className={cn('mt-0.5', v.text)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-xs text-muted">{toast.message}</div>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-faint transition-colors hover:text-ink"
        aria-label="Dismiss"
      >
        <Icon name="x" size={15} />
      </button>
    </motion.div>
  )
}

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex flex-col gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
