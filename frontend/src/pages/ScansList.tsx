import { useEffect, useMemo, useState } from 'react'
import { useScansStore } from '@/store/scansStore'
import { isRunning } from '@/lib/constants'
import { cn } from '@/lib/cn'
import type { Scan } from '@/types'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScanCard } from '@/components/scans/ScanCard'

type Filter = 'all' | 'running' | 'completed' | 'failed'

const matchesFilter = (s: Scan, f: Filter) =>
  f === 'all'
    ? true
    : f === 'running'
      ? isRunning(s.status)
      : f === 'completed'
        ? s.status === 'completed'
        : s.status === 'failed' || s.status === 'canceled'

export default function ScansList() {
  const { scans, fetchScans, loaded } = useScansStore()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    fetchScans()
    const iv = setInterval(() => fetchScans({ silent: true }), 4000)
    return () => clearInterval(iv)
  }, [fetchScans])

  const counts = useMemo(
    () => ({
      all: scans.length,
      running: scans.filter((s) => isRunning(s.status)).length,
      completed: scans.filter((s) => s.status === 'completed').length,
      failed: scans.filter((s) => s.status === 'failed' || s.status === 'canceled').length,
    }),
    [scans],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scans
      .filter((s) => matchesFilter(s, filter))
      .filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          s.target.toLowerCase().includes(needle),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [scans, filter, q])

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'running', label: 'Running' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Scans</h2>
          <p className="mt-1 text-sm text-muted">{counts.all} total · {counts.running} active</p>
        </div>
        <Button to="/scans/new" iconLeft="plus">
          New scan
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or target…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                filter === f.key ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'nums rounded-full px-1.5 text-[0.66rem]',
                  filter === f.key ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-faint',
                )}
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {!loaded ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[188px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="radar"
            title="No scans match"
            description="Try a different search or filter, or launch a fresh scan against a target."
            action={
              <Button to="/scans/new" iconLeft="plus">
                New scan
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((scan, i) => (
            <ScanCard key={scan.id} scan={scan} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
