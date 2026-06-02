import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import type { Finding, Severity } from '@/types'
import { ConfidenceBadge, SeverityBadge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'

type Sort = 'severity' | 'cvss' | 'name'

export function FindingsTable({ findings }: { findings: Finding[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [sev, setSev] = useState<Severity | 'all'>('all')
  const [sort, setSort] = useState<Sort>('severity')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = findings
      .filter((f) => sev === 'all' || f.severity === sev)
      .filter(
        (f) =>
          !needle ||
          f.name.toLowerCase().includes(needle) ||
          f.category.toLowerCase().includes(needle) ||
          f.cveIds.some((c) => c.toLowerCase().includes(needle)),
      )
    out.sort((a, b) => {
      if (sort === 'cvss') return b.cvss - a.cvss
      if (sort === 'name') return a.name.localeCompare(b.name)
      return SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank || b.cvss - a.cvss
    })
    return out
  }, [findings, sev, sort, q])

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-3 border-b border-line/70 p-4 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings, CVEs…" className="h-9 pl-9 text-xs" />
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto">
            <Chip active={sev === 'all'} onClick={() => setSev('all')}>
              All
            </Chip>
            {SEVERITY_ORDER.map((s) => (
              <Chip key={s} active={sev === s} onClick={() => setSev(s)} dotClass={SEVERITY_META[s].dot}>
                {SEVERITY_META[s].label}
              </Chip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 font-mono text-[0.66rem] uppercase tracking-wider text-faint">
            <Icon name="filter" size={13} /> sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-ink outline-none"
            >
              <option value="severity">Severity</option>
              <option value="cvss">CVSS</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="search" title="No findings match" description="Adjust the filters or search to see results." />
      ) : (
        <ul className="divide-y divide-line/60">
          {rows.map((f) => {
            const open = openId === f.id
            const m = SEVERITY_META[f.severity]
            return (
              <li key={f.id}>
                <button
                  onClick={() => setOpenId(open ? null : f.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/40"
                >
                  <SeverityBadge severity={f.severity} size="sm" withDot={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{f.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[0.66rem] text-faint">
                      <span className="truncate">{f.category}</span>
                      {f.cveIds.slice(0, 1).map((c) => (
                        <span key={c} className="rounded bg-surface-3 px-1.5 py-0.5 text-accent">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="hidden items-center gap-4 sm:flex">
                    {f.validated && (
                      <span className="flex items-center gap-1 text-[0.66rem] text-low" title="Exploit validated">
                        <Icon name="shield-check" size={14} /> verified
                      </span>
                    )}
                    <span className="hidden md:block">
                      <ConfidenceBadge confidence={f.confidence} />
                    </span>
                    <span className={cn('nums w-9 text-right font-mono text-sm font-semibold', m.text)}>
                      {f.cvss.toFixed(1)}
                    </span>
                  </div>
                  <Icon
                    name="chevron-down"
                    size={16}
                    className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180 text-accent')}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 bg-surface-2/30 px-4 pb-5 pt-1">
                        <p className="text-sm leading-relaxed text-muted">{f.description}</p>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Detail label="Endpoint">
                            <code className="break-all text-xs text-ink">
                              <span className="text-accent">{f.method}</span> {f.endpoint}
                            </code>
                          </Detail>
                          <Detail label="Weakness">
                            <span className="font-mono text-xs text-ink">
                              {f.cweId}
                              {f.cveIds.length > 0 && ` · ${f.cveIds.join(', ')}`}
                            </span>
                          </Detail>
                        </div>

                        <Block label="Evidence" tone="evidence">
                          {f.evidence}
                        </Block>
                        <Block label="Recommendation" tone="fix">
                          {f.recommendation}
                        </Block>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex flex-wrap gap-2">
                            {f.references.map((r) => (
                              <a
                                key={r.url}
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[0.68rem] text-muted transition-colors hover:border-accent/40 hover:text-accent"
                              >
                                {r.label}
                                <Icon name="external" size={11} />
                              </a>
                            ))}
                          </div>
                          <span className="font-mono text-[0.64rem] text-faint">
                            found {formatDateTime(f.discoveredAt)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  dotClass,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  dotClass?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors',
        active ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {dotClass && <span className={cn('size-2 rounded-full', dotClass)} />}
      {children}
    </button>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      <div className="eyebrow mb-1">{label}</div>
      {children}
    </div>
  )
}

function Block({ label, children, tone }: { label: string; children: React.ReactNode; tone: 'evidence' | 'fix' }) {
  return (
    <div>
      <div className="eyebrow mb-1.5 flex items-center gap-1.5">
        <Icon name={tone === 'evidence' ? 'terminal' : 'shield-check'} size={12} className={tone === 'fix' ? 'text-low' : 'text-accent'} />
        {label}
      </div>
      <div
        className={cn(
          'rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
          tone === 'evidence'
            ? 'border-line bg-bg/60 font-mono text-ink/85'
            : 'border-low/25 bg-low/5 text-muted',
        )}
      >
        {children}
      </div>
    </div>
  )
}
