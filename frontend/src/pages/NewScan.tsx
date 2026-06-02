import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { useScansStore } from '@/store/scansStore'
import { toast } from '@/store/uiStore'
import { cn } from '@/lib/cn'
import { SCAN_TYPE_META } from '@/lib/constants'
import type { ScanOptions, ScanType } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Field, Input, Select, Switch } from '@/components/ui/Field'

const SCAN_TYPES: ScanType[] = ['baseline', 'quick', 'full', 'api']

function defaultsFor(type: ScanType): ScanOptions {
  switch (type) {
    case 'baseline':
      return { activeScan: false, ajaxSpider: false, aiCveMatching: true, exploitValidation: false, maxDepth: 3 }
    case 'quick':
      return { activeScan: true, ajaxSpider: false, aiCveMatching: true, exploitValidation: false, maxDepth: 4 }
    case 'api':
      return { activeScan: true, ajaxSpider: false, aiCveMatching: true, exploitValidation: true, maxDepth: 6 }
    default:
      return { activeScan: true, ajaxSpider: true, aiCveMatching: true, exploitValidation: true, maxDepth: 5 }
  }
}

const isValidTarget = (t: string) =>
  /^(https?:\/\/)?([\w-]+\.)+[\w-]+(:\d+)?(\/\S*)?$/i.test(t.trim()) ||
  /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(t.trim())

const OPTION_DEFS: { key: keyof ScanOptions; label: string; desc: string; icon: 'zap' | 'scan' | 'sparkles' | 'flask' }[] = [
  { key: 'activeScan', label: 'Active scan', desc: 'Send live injection payloads to the target', icon: 'zap' },
  { key: 'ajaxSpider', label: 'AJAX spider', desc: 'Crawl JavaScript-rendered routes', icon: 'scan' },
  { key: 'aiCveMatching', label: 'AI CVE matching', desc: 'Correlate findings via Azure AI Foundry', icon: 'sparkles' },
  { key: 'exploitValidation', label: 'Exploit validation', desc: 'Confirm vulnerabilities, cut false positives', icon: 'flask' },
]

export default function NewScan() {
  const navigate = useNavigate()
  const upsert = useScansStore((s) => s.upsert)

  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const [scanType, setScanType] = useState<ScanType>('full')
  const [options, setOptions] = useState<ScanOptions>(defaultsFor('full'))
  const [authorized, setAuthorized] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ target?: string; authorized?: string }>({})

  const selectType = (t: ScanType) => {
    setScanType(t)
    setOptions(defaultsFor(t))
  }

  const setOption = (key: keyof ScanOptions, value: boolean) =>
    setOptions((o) => ({ ...o, [key]: value }))

  const meta = SCAN_TYPE_META[scanType]
  const enabledOptions = OPTION_DEFS.filter((o) => options[o.key])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!target.trim()) next.target = 'A target URL or IP is required'
    else if (!isValidTarget(target)) next.target = 'Enter a valid URL, domain, or IP address'
    if (!authorized) next.authorized = 'You must confirm authorization to scan this target'
    setErrors(next)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      const scan = await api.createScan({ name: name.trim(), target: target.trim(), scanType, options, authorized })
      upsert(scan)
      toast.success('Scan queued', `${meta.label} scan launched against ${scan.target}`)
      navigate(`/scans/${scan.id}`)
    } catch (err) {
      toast.error('Could not start scan', err instanceof Error ? err.message : undefined)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* ── Main column ── */}
      <div className="space-y-6">
        <Card title="Target" eyebrow="Step 1" icon="target">
          <Field
            label="URL, domain, or IP address"
            htmlFor="target"
            required
            error={errors.target}
            hint="The system or application you are authorized to test."
          >
            <Input
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://staging.acme-demo.com"
              autoFocus
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Scan name" htmlFor="name" hint="Optional — a friendly label for this run." className="mt-4">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production storefront — full sweep"
            />
          </Field>
        </Card>

        <Card title="Scan profile" eyebrow="Step 2" icon="sliders">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCAN_TYPES.map((t) => {
              const m = SCAN_TYPE_META[t]
              const active = scanType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectType(t)}
                  className={cn(
                    'group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
                    active
                      ? 'border-accent/50 bg-accent/5 shadow-glow-sm'
                      : 'border-line bg-surface-2/40 hover:border-line-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('grid size-9 place-items-center rounded-lg border', active ? 'border-accent/40 bg-accent/15 text-accent' : 'border-line bg-surface-3 text-muted')}>
                      <Icon name={m.icon} size={18} />
                    </span>
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full border transition-colors',
                        active ? 'border-accent bg-accent text-bg' : 'border-line-strong',
                      )}
                    >
                      {active && <Icon name="check" size={13} />}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-ink">{m.label}</span>
                      <span className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">{m.tagline}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{m.description}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5 pt-1 font-mono text-[0.66rem] text-faint">
                    <Icon name="clock" size={12} /> {m.estMinutes}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        <Card title="Engine options" eyebrow="Step 3" icon="cpu">
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTION_DEFS.map((o) => (
              <Switch
                key={o.key}
                checked={Boolean(options[o.key])}
                onChange={(v) => setOption(o.key, v)}
                label={o.label}
                description={o.desc}
                icon={<Icon name={o.icon} size={17} />}
              />
            ))}
          </div>
          <Field label="Crawl depth" htmlFor="depth" className="mt-4 max-w-[12rem]">
            <Select
              id="depth"
              value={options.maxDepth}
              onChange={(e) => setOptions((s) => ({ ...s, maxDepth: Number(e.target.value) }))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'level' : 'levels'}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>

      {/* ── Summary rail ── */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card title="Launch summary" eyebrow="Review" icon="play">
          <dl className="space-y-3 text-sm">
            <SummaryRow label="Target">
              <span className="break-all font-mono text-xs text-ink">{target || '—'}</span>
            </SummaryRow>
            <SummaryRow label="Profile">
              <span className="text-ink">{meta.label}</span>
            </SummaryRow>
            <SummaryRow label="Policy">
              <span className="font-mono text-xs text-muted">{meta.policy}</span>
            </SummaryRow>
            <SummaryRow label="Est. duration">
              <span className="text-ink">{meta.estMinutes}</span>
            </SummaryRow>
          </dl>

          <div className="mt-4 border-t border-line/60 pt-4">
            <div className="eyebrow mb-2">Enabled</div>
            <div className="flex flex-wrap gap-1.5">
              {enabledOptions.length === 0 ? (
                <span className="text-xs text-faint">Passive only</span>
              ) : (
                enabledOptions.map((o) => (
                  <span
                    key={o.key}
                    className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-1 text-[0.66rem] text-muted"
                  >
                    <Icon name={o.icon} size={11} className="text-accent" />
                    {o.label}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Authorization */}
          <button
            type="button"
            onClick={() => {
              setAuthorized((a) => !a)
              setErrors((e) => ({ ...e, authorized: undefined }))
            }}
            className={cn(
              'mt-4 flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
              authorized ? 'border-low/40 bg-low/5' : errors.authorized ? 'border-critical/50 bg-critical/5' : 'border-line bg-surface-2/50',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                authorized ? 'border-low bg-low text-bg' : 'border-line-strong',
              )}
            >
              {authorized && <Icon name="check" size={13} />}
            </span>
            <span className="text-xs leading-relaxed text-muted">
              I confirm I am <span className="text-ink">authorized</span> to perform security testing
              against this target.
            </span>
          </button>
          {errors.authorized && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-critical">
              <Icon name="alert-triangle" size={13} />
              {errors.authorized}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" loading={submitting} iconLeft="play" className="mt-4">
            {submitting ? 'Launching…' : 'Launch scan'}
          </Button>
          <p className="mt-3 text-center text-[0.68rem] leading-relaxed text-faint">
            An ephemeral container is provisioned for the scan and destroyed on completion.
          </p>
        </Card>
      </div>
    </form>
  )
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
