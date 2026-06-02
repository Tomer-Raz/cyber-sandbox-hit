import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type StatusPayload } from '@/api'
import { useScansStore } from '@/store/scansStore'
import { toast } from '@/store/uiStore'
import { cn } from '@/lib/cn'
import { isRunning, SCAN_TYPE_META, STATUS_META } from '@/lib/constants'
import { formatClock, formatDuration, formatRelativeTime } from '@/lib/format'
import type { ScanEvent } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { LoaderBlock } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { PhaseStepper } from '@/components/scans/PhaseStepper'
import { SeverityBar } from '@/components/dashboard/SeverityBar'

const TERMINAL = ['completed', 'failed', 'canceled']

const LEVEL_STYLE: Record<ScanEvent['level'], { text: string; glyph: string }> = {
  info: { text: 'text-muted', glyph: '›' },
  success: { text: 'text-low', glyph: '✓' },
  warn: { text: 'text-medium', glyph: '⚠' },
  error: { text: 'text-critical', glyph: '✗' },
}

export default function ScanStatus() {
  const { id } = useParams<{ id: string }>()
  const upsert = useScansStore((s) => s.upsert)
  const [data, setData] = useState<StatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    let iv: ReturnType<typeof setInterval> | undefined
    const tick = async () => {
      try {
        const d = await api.getScanStatus(id)
        if (!alive) return
        setData(d)
        upsert(d.scan)
        if (TERMINAL.includes(d.scan.status) && iv) {
          clearInterval(iv)
          iv = undefined
        }
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Scan not found')
        if (iv) clearInterval(iv)
      }
    }
    tick()
    iv = setInterval(tick, 1500)
    return () => {
      alive = false
      if (iv) clearInterval(iv)
    }
  }, [id, upsert])

  // Auto-scroll the log as new lines stream in.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [data?.events.length])

  const handleCancel = async () => {
    if (!id) return
    setConfirmCancel(false)
    try {
      const scan = await api.cancelScan(id)
      upsert(scan)
      setData((d) => (d ? { ...d, scan } : d))
      toast.warning('Scan canceled', 'The container was torn down.')
    } catch {
      toast.error('Could not cancel scan')
    }
  }

  if (error) {
    return (
      <div className="panel">
        <EmptyState
          icon="alert-triangle"
          title="Scan not found"
          description={error}
          action={
            <Button to="/scans" variant="secondary" iconLeft="arrow-left">
              Back to scans
            </Button>
          }
        />
      </div>
    )
  }

  if (!data) return <LoaderBlock label="Connecting to scan…" />

  const { scan, events } = data
  const running = isRunning(scan.status)
  const meta = SCAN_TYPE_META[scan.scanType]
  const done = scan.status === 'completed'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/scans" className="eyebrow mb-2 inline-flex items-center gap-1.5 hover:text-accent">
            <Icon name="arrow-left" size={13} /> Scans
          </Link>
          <h2 className="truncate font-display text-2xl font-bold text-ink">{scan.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Icon name="globe" size={13} className="text-faint" />
              {scan.target}
            </span>
            <span className="size-0.5 rounded-full bg-faint" />
            <span>{meta.label}</span>
            <span className="size-0.5 rounded-full bg-faint" />
            <span>{scan.region}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={scan.status} />
          {running && (
            <Button variant="danger" size="sm" iconLeft="stop" onClick={() => setConfirmCancel(true)}>
              Cancel
            </Button>
          )}
          {done && (
            <Button to={`/scans/${scan.id}/report`} iconLeft="file" size="sm">
              View report
            </Button>
          )}
        </div>
      </div>

      {/* Completed banner */}
      {done && (
        <Card className="border-low/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-low/40 bg-low/10 text-low">
                <Icon name="check-circle" size={22} />
              </span>
              <div>
                <div className="font-display font-semibold text-ink">Scan complete</div>
                <div className="text-sm text-muted">
                  {scan.totalFindings} findings · risk score {scan.riskScore} · {formatDuration(scan.durationSec)}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <SeverityBar counts={scan.counts} showLegend />
            </div>
          </div>
        </Card>
      )}

      {/* Progress */}
      <Card>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <div className="eyebrow mb-1">{running ? 'In progress' : STATUS_META[scan.status].label}</div>
            <div className="flex items-baseline gap-2">
              <span className="nums font-display text-3xl font-bold text-ink">{scan.progress}</span>
              <span className="font-mono text-sm text-faint">%</span>
            </div>
          </div>
          <div className="text-right font-mono text-xs text-muted">
            <div>started {formatRelativeTime(scan.startedAt)}</div>
            {scan.durationSec != null && <div className="text-faint">took {formatDuration(scan.durationSec)}</div>}
          </div>
        </div>
        <ProgressBar value={scan.progress} indeterminate={running && scan.progress < 2} height={10} />
        <div className="mt-7">
          <PhaseStepper phase={scan.phase} status={scan.status} />
        </div>
      </Card>

      {/* Live log */}
      <Card
        title="Execution log"
        icon="terminal"
        eyebrow="ACI container · live"
        bodyClassName="p-0"
        actions={
          running ? (
            <span className="flex items-center gap-1.5 font-mono text-[0.64rem] uppercase tracking-widest2 text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" /> streaming
            </span>
          ) : (
            <span className="font-mono text-[0.64rem] uppercase tracking-widest2 text-faint">
              {events.length} lines
            </span>
          )
        }
      >
        <div ref={logRef} className="max-h-[22rem] overflow-y-auto scroll-smooth p-4 font-mono text-xs leading-relaxed">
          {events.map((ev) => {
            const ls = LEVEL_STYLE[ev.level]
            return (
              <div key={ev.id} className="flex gap-3 py-0.5">
                <span className="shrink-0 text-faint">{formatClock(ev.ts)}</span>
                <span className={cn('shrink-0', ls.text)}>{ls.glyph}</span>
                <span className={cn('min-w-0', ev.level === 'info' ? 'text-ink/80' : ls.text)}>
                  {ev.message}
                </span>
              </div>
            )
          })}
          {running && (
            <div className="flex gap-3 py-0.5 text-faint">
              <span className="shrink-0">{formatClock(new Date().toISOString())}</span>
              <span className="inline-block h-3.5 w-2 translate-y-0.5 bg-accent motion-safe:animate-blink" />
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        eyebrow="Confirm"
        title="Cancel this scan?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep running
            </Button>
            <Button variant="danger" iconLeft="stop" onClick={handleCancel}>
              Cancel scan
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          The ephemeral scanner container will be torn down immediately and partial results
          discarded. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
