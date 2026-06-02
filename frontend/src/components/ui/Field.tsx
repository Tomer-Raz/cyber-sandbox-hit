import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

const baseInput =
  'w-full rounded-xl border border-line bg-surface-2/80 px-3.5 text-sm text-ink placeholder:text-faint ' +
  'transition-colors outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 ' +
  'disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseInput, 'h-11', className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(baseInput, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />
})

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(baseInput, 'h-11 appearance-none pr-10', className)}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  )
})

export function Label({
  children,
  htmlFor,
  required,
  className,
}: {
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
  className?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('mb-1.5 block text-[0.8rem] font-medium text-ink/90', className)}
    >
      {children}
      {required && <span className="ml-0.5 text-accent">*</span>}
    </label>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-faint">{children}</p>
}

export function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-critical">
      <Icon name="alert-triangle" size={13} />
      {children}
    </p>
  )
}

export interface FieldProps {
  label?: string
  htmlFor?: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        checked ? 'border-accent/40 bg-accent/5' : 'border-line bg-surface-2/50 hover:border-line-strong',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {icon && (
        <span className={cn('grid size-9 place-items-center rounded-lg', checked ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-muted')}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-bg shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
