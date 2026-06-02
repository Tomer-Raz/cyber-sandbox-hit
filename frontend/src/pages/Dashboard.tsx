import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { useScansStore } from '@/store/scansStore'
import { isRunning } from '@/lib/constants'
import type { DashboardStats } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/dashboard/StatCard'
import { SeverityBar } from '@/components/dashboard/SeverityBar'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { TrendArea } from '@/components/charts/TrendArea'
import { ScanCard } from '@/components/scans/ScanCard'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { scans, fetchScans, loaded } = useScansStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    fetchScans()
    api.getDashboard().then(setStats)
    const iv = setInterval(() => {
      fetchScans({ silent: true })
      api.getDashboard().then(setStats)
    }, 4000)
    return () => clearInterval(iv)
  }, [fetchScans])

  const running = scans.filter((s) => isRunning(s.status))
  const recent = [...scans].sort((a, b) => {
    const ar = isRunning(a.status) ? 1 : 0
    const br = isRunning(b.status) ? 1 : 0
    if (ar !== br) return br - ar
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1.5">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-[1.7rem]">
            {greeting()}, {user?.name.split(' ')[0]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {running.length > 0
              ? `${running.length} scan${running.length > 1 ? 's' : ''} running right now.`
              : 'No active scans — your attack surface is quiet.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button to="/scans" variant="secondary" iconLeft="radar" size="md">
            All scans
          </Button>
          <Button to="/scans/new" iconLeft="plus" size="md">
            New scan
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total scans" value={stats.totalScans} icon="radar" hint={`${stats.completedScans} completed`} delay={0} />
          <StatCard label="Findings" value={stats.totalFindings} icon="bug" hint="across completed scans" delay={70} />
          <StatCard label="Critical" value={stats.criticalFindings} icon="alert-octagon" tone="critical" hint="need immediate action" delay={140} />
          <StatCard label="Avg risk score" value={stats.avgRiskScore} icon="gauge" tone="medium" suffix="/100" delay={210} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px]" />
          ))}
        </div>
      )}

      {/* Trend + severity mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Findings activity"
          eyebrow="Last 7 days"
          icon="trending-up"
          className="lg:col-span-2"
          actions={
            <span className="font-mono text-[0.66rem] uppercase tracking-widest2 text-faint">
              findings / day
            </span>
          }
        >
          {stats ? <TrendArea data={stats.trend} /> : <Skeleton className="h-[180px]" />}
        </Card>

        <Card title="Severity mix" eyebrow="All findings" icon="layers">
          {stats ? (
            <>
              <SeverityDonut counts={stats.severityTotals} size={180} />
              <SeverityBar counts={stats.severityTotals} showLegend className="mt-4" />
            </>
          ) : (
            <Skeleton className="mx-auto h-[180px] w-[180px] rounded-full" />
          )}
        </Card>
      </div>

      {/* Recent scans */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Icon name="activity" size={18} className="text-accent" />
            Recent scans
          </h3>
          <Link to="/scans" className="group flex items-center gap-1 text-sm text-muted transition-colors hover:text-accent">
            View all
            <Icon name="arrow-right" size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {!loaded ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[188px]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.slice(0, 6).map((scan, i) => (
              <ScanCard key={scan.id} scan={scan} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
