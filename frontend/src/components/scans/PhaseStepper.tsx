import { cn } from '@/lib/cn'
import { PHASE_FLOW, PHASES } from '@/lib/constants'
import type { PhaseKey, ScanStatus } from '@/types'
import { Icon } from '@/components/ui/Icon'

type StepState = 'done' | 'active' | 'pending' | 'error'

function stepState(stepKey: PhaseKey, phase: PhaseKey, status: ScanStatus): StepState {
  const cur = PHASE_FLOW.indexOf(phase)
  const idx = PHASE_FLOW.indexOf(stepKey)
  if (status === 'completed') return 'done'
  if (status === 'failed' && idx === cur) return 'error'
  if (status === 'canceled' && idx === cur) return 'error'
  if (idx < cur) return 'done'
  if (idx === cur) return 'active'
  return 'pending'
}

export function PhaseStepper({ phase, status }: { phase: PhaseKey; status: ScanStatus }) {
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-2">
      {PHASES.map((p, i) => {
        const state = stepState(p.key, phase, status)
        const last = i === PHASES.length - 1
        return (
          <li key={p.key} className="flex flex-1 gap-3 sm:flex-col sm:gap-0">
            {/* marker + connector */}
            <div className="flex flex-col items-center sm:flex-row">
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full border transition-colors',
                  state === 'done' && 'border-low/50 bg-low/15 text-low',
                  state === 'active' && 'border-accent bg-accent/15 text-accent animate-pulse-ring',
                  state === 'error' && 'border-critical/50 bg-critical/15 text-critical',
                  state === 'pending' && 'border-line bg-surface-2 text-faint',
                )}
              >
                {state === 'done' ? (
                  <Icon name="check" size={16} />
                ) : state === 'error' ? (
                  <Icon name="x" size={15} />
                ) : (
                  <Icon name={p.icon} size={15} />
                )}
              </span>
              {!last && (
                <span
                  className={cn(
                    'my-1 w-px flex-1 sm:mx-2 sm:my-0 sm:h-px sm:w-full sm:flex-1',
                    state === 'done' ? 'bg-low/40' : 'bg-line',
                  )}
                  style={{ minHeight: 18 }}
                />
              )}
            </div>
            {/* label */}
            <div className="pb-4 sm:pb-0 sm:pt-2">
              <div
                className={cn(
                  'text-xs font-semibold',
                  state === 'pending' ? 'text-faint' : state === 'error' ? 'text-critical' : 'text-ink',
                )}
              >
                {p.label}
              </div>
              <div className="mt-0.5 hidden text-[0.68rem] leading-snug text-muted lg:block">
                {state === 'active' ? p.description : ''}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
