import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertOutlined, BugOutlined, DashboardOutlined, PlusOutlined, RadarChartOutlined } from '@ant-design/icons'
import { Button, Card, Col, Flex, Row, Space, Statistic, Typography } from 'antd'
import { api } from '@/api'
import { useAuth } from '@/auth/AuthContext'
import { useScansStore } from '@/store/scansStore'
import { isRunning, SEVERITY_META } from '@/lib/constants'
import type { DashboardStats } from '@/types'
import { SeverityBar } from '@/components/charts/SeverityBar'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { TrendArea } from '@/components/charts/TrendArea'
import { ScanTable } from '@/components/scans/ScanTable'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Flex wrap gap={16} align="flex-end" justify="space-between">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {greeting()}, {user?.name.split(' ')[0]}
          </Typography.Title>
          <Typography.Text type="secondary">
            {running.length > 0
              ? `${running.length} scan${running.length > 1 ? 's' : ''} running right now.`
              : 'No active scans — your attack surface is quiet.'}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<RadarChartOutlined />} onClick={() => navigate('/scans')}>
            All scans
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/scans/new')}>
            New scan
          </Button>
        </Space>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card loading={!stats}>
            <Statistic
              title="Total scans"
              value={stats?.totalScans ?? 0}
              prefix={<RadarChartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={!stats}>
            <Statistic title="Findings" value={stats?.totalFindings ?? 0} prefix={<BugOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={!stats}>
            <Statistic
              title="Critical"
              value={stats?.criticalFindings ?? 0}
              prefix={<AlertOutlined />}
              valueStyle={{ color: SEVERITY_META.critical.hex }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={!stats}>
            <Statistic
              title="Avg risk score"
              value={stats?.avgRiskScore ?? 0}
              suffix="/ 100"
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
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
