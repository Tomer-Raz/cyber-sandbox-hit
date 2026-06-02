import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/api'
import { toast } from '@/store/uiStore'
import { cn } from '@/lib/cn'
import { SCAN_TYPE_META, SEVERITY_META } from '@/lib/constants'
import { formatDateTime, riskBand } from '@/lib/format'
import type { ScanReport } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { LoaderBlock } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { RadialGauge } from '@/components/ui/RadialGauge'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { FindingsByCategoryBar } from '@/components/charts/FindingsByCategoryBar'
import { SeverityBar } from '@/components/dashboard/SeverityBar'
import { FindingsTable } from '@/components/scans/FindingsTable'

export default function Report() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ScanReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setReport(null)
    setError(null)
    api
      .getReport(id)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'Report not found'))
  }, [id])

  if (error) {
    return (
      <div className="panel">
        <EmptyState
          icon="alert-triangle"
          title="Report unavailable"
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

  if (!report) return <LoaderBlock label="Compiling report…" />

  const { scan, findings, ai, findingsByCategory, events } = report

  if (scan.status !== 'completed') {
    return (
      <div className="panel">
        <EmptyState
          icon="clock"
          title="Scan still in progress"
          description="The full report becomes available once the scan completes."
          action={
            <Button to={`/scans/${scan.id}`} iconLeft="activity">
              View live progress
            </Button>
          }
        />
      </div>
    )
  }

  const band = riskBand(scan.riskScore)
  const meta = SCAN_TYPE_META[scan.scanType]
  const validated = findings.filter((f) => f.validated).length
  const cves = new Set(findings.flatMap((f) => f.cveIds)).size
  const criticalHigh = scan.counts.critical + scan.counts.high

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scan.id}-report.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported', 'Saved as JSON.')
  }

  const exportPdf = () => {
    toast.info('Preparing PDF', 'Use your browser print dialog to save as PDF.')
    setTimeout(() => window.print(), 350)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/scans/${scan.id}`} className="eyebrow mb-2 inline-flex items-center gap-1.5 hover:text-accent">
            <Icon name="arrow-left" size={13} /> Scan
          </Link>
          <h2 className="truncate font-display text-2xl font-bold text-ink">{scan.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Icon name="globe" size={13} className="text-faint" /> {scan.target}
            </span>
            <span className="size-0.5 rounded-full bg-faint" />
            <span>{meta.label}</span>
            <span className="size-0.5 rounded-full bg-faint" />
            <span>completed {formatDateTime(scan.completedAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" iconLeft="download" onClick={exportJson}>
            JSON
          </Button>
          <Button variant="secondary" size="sm" iconLeft="file" onClick={exportPdf}>
            PDF
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Risk posture" eyebrow="Aggregate" icon="gauge">
          <div className="flex items-center gap-5">
            <RadialGauge value={scan.riskScore} colorHex={SEVERITY_META[band.tone].hex} label="risk" />
            <div>
              <div className={cn('font-display text-xl font-bold', SEVERITY_META[band.tone].text)}>
                {band.label}
              </div>
              <p className="mt-1 max-w-[12rem] text-xs leading-relaxed text-muted">
                Weighted across {findings.length} findings and exploit validation results.
              </p>
              <div className="mt-3">
                <SeverityBar counts={scan.counts} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Breakdown" eyebrow="Findings" icon="layers">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Total" value={findings.length} icon="bug" />
            <Kpi label="Critical + High" value={criticalHigh} icon="alert-octagon" tone="text-critical" />
            <Kpi label="Validated" value={validated} icon="shield-check" tone="text-low" />
            <Kpi label="CVEs matched" value={cves} icon="hash" tone="text-accent" />
          </div>
        </Card>

        <Card title="AI analysis" eyebrow="Azure AI Foundry" icon="sparkles">
          <div className="text-sm font-semibold text-ink">{ai.headline}</div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{ai.summary}</p>
          {ai.topRisks.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {ai.topRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink/85">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 font-mono text-[0.62rem] text-faint">
            <span>{ai.model}</span>
            <span>{Math.round(ai.confidence * 100)}% confidence</span>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By severity" icon="layers">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <SeverityDonut counts={scan.counts} size={168} />
            </div>
            <SeverityBar counts={scan.counts} showLegend className="flex-1" />
          </div>
        </Card>
        <Card title="By category" icon="hash">
          <FindingsByCategoryBar data={findingsByCategory} />
        </Card>
      </div>

      {/* Findings */}
      <Card title="Findings" eyebrow={`${findings.length} total`} icon="bug" bodyClassName="p-0">
        <FindingsTable findings={findings} />
      </Card>

      {/* Timeline */}
      <Card title="Scan timeline" eyebrow="Lifecycle" icon="activity">
        <ol className="relative space-y-3 pl-4">
          <span className="absolute left-[3px] top-1 h-[calc(100%-0.5rem)] w-px bg-line" />
          {events.map((ev) => (
            <li key={ev.id} className="relative flex items-center gap-3">
              <span
                className={cn(
                  'absolute -left-4 size-2 rounded-full ring-2 ring-bg',
                  ev.level === 'success' ? 'bg-low' : ev.level === 'error' ? 'bg-critical' : ev.level === 'warn' ? 'bg-medium' : 'bg-accent',
                )}
              />
              <span className="w-16 shrink-0 font-mono text-[0.66rem] text-faint">
                {formatDateTime(ev.ts).split(', ')[1] ?? ''}
              </span>
              <span className="text-xs text-muted">{ev.message}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon,
  tone = 'text-ink',
}: {
  label: string
  value: number
  icon: 'bug' | 'alert-octagon' | 'shield-check' | 'hash'
  tone?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon name={icon} size={15} className={tone} />
      </div>
      <div className={cn('nums mt-1.5 font-display text-2xl font-bold', tone)}>{value}</div>
    </div>
  )
}
