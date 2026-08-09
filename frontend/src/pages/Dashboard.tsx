import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertOutlined,
  BugOutlined,
  DashboardOutlined,
  PlusOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Row, Space, Statistic } from 'antd'
import { api } from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { useScansStore } from '@/store/scansStore'
import { isRunning } from '@/lib/constants'
import { usePolling } from '@/lib/hooks'
import { useSeverityHex } from '@/theme/palette'
import type { DashboardStats } from '@/types'
import { SeverityBar } from '@/components/charts/SeverityBar'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { TrendArea } from '@/components/charts/TrendArea'
import { ScanTable } from '@/components/scans/ScanTable'
import { PageHeader } from '@/components/ui/PageHeader'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { scans, fetchScans, loaded } = useScansStore()
  const severityHex = useSeverityHex()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  usePolling(() => {
    void fetchScans({ silent: loaded })
    void api.getDashboard().then(setStats)
  }, 4000)

  const runningCount = scans.filter((s) => isRunning(s.status)).length

  // Running scans float to the top, then newest first.
  const recent = [...scans].sort(
    (a, b) =>
      Number(isRunning(b.status)) - Number(isRunning(a.status)) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const tiles = [
    { title: 'Total scans', value: stats?.totalScans, icon: <RadarChartOutlined /> },
    { title: 'Findings', value: stats?.totalFindings, icon: <BugOutlined /> },
    {
      title: 'Critical',
      value: stats?.criticalFindings,
      icon: <AlertOutlined />,
      color: severityHex.critical,
    },
    {
      title: 'Avg risk score',
      value: stats?.avgRiskScore,
      icon: <DashboardOutlined />,
      suffix: '/ 100',
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(' ')[0]}`}
        subtitle={
          runningCount > 0
            ? `${runningCount} scan${runningCount > 1 ? 's' : ''} running right now.`
            : 'No active scans — your attack surface is quiet.'
        }
        extra={
          <>
            <Button icon={<RadarChartOutlined />} onClick={() => navigate('/scans')}>
              All scans
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/scans/new')}>
              New scan
            </Button>
          </>
        }
      />

      <Row gutter={[16, 16]}>
        {tiles.map((t) => (
          <Col xs={12} md={6} key={t.title}>
            <Card loading={!stats}>
              <Statistic
                title={t.title}
                value={t.value ?? 0}
                prefix={t.icon}
                suffix={t.suffix}
                valueStyle={t.color ? { color: t.color } : undefined}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Findings activity" loading={!stats}>
            {stats && <TrendArea data={stats.trend} />}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Severity mix" loading={!stats}>
            {stats && (
              <>
                <SeverityDonut counts={stats.severityTotals} size={180} />
                <div style={{ marginTop: 16 }}>
                  <SeverityBar counts={stats.severityTotals} showLegend />
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Recent scans" extra={<Link to="/scans">View all</Link>}>
        <ScanTable data={recent.slice(0, 6)} loading={!loaded} />
      </Card>
    </Space>
  )
}
