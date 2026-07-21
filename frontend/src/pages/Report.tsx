import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Flex,
  Progress,
  Result,
  Row,
  Space,
  Statistic,
  Timeline,
  Typography,
} from 'antd'
import { api } from '@/api'
import { toast } from '@/lib/notify'
import { SCAN_TYPE_META, SEVERITY_META } from '@/lib/constants'
import { formatDateTime, riskBand } from '@/lib/format'
import type { ScanEvent, ScanReport } from '@/types'
import { FindingsByCategoryBar } from '@/components/charts/FindingsByCategoryBar'
import { SeverityBar } from '@/components/charts/SeverityBar'
import { SeverityDonut } from '@/components/charts/SeverityDonut'
import { FindingsTable } from '@/components/scans/FindingsTable'

const TIMELINE_COLOR: Record<ScanEvent['level'], string> = {
  info: 'blue',
  success: 'green',
  warn: 'orange',
  error: 'red',
}

export default function Report() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
      <Result
        status="404"
        title="Report unavailable"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => navigate('/scans')}>
            Back to scans
          </Button>
        }
      />
    )
  }

  if (!report) return <Card loading />

  const { scan, findings, ai, findingsByCategory, events } = report

  if (scan.status !== 'completed') {
    return (
      <Result
        status="info"
        title="Scan still in progress"
        subTitle="The full report becomes available once the scan completes."
        extra={
          <Button type="primary" onClick={() => navigate(`/scans/${scan.id}`)}>
            View live progress
          </Button>
        }
      />
    )
  }

  const band = riskBand(scan.riskScore)
  const bandHex = SEVERITY_META[band.tone].hex
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
    toast.success('Report exported as JSON')
  }

  const exportPdf = () => {
    toast.info('Preparing PDF', 'Use your browser print dialog to save as PDF.')
    setTimeout(() => window.print(), 350)
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Flex wrap gap={16} align="flex-end" justify="space-between">
        <div style={{ minWidth: 0 }}>
          <Link to={`/scans/${scan.id}`}>
            <ArrowLeftOutlined /> Scan
          </Link>
          <Typography.Title level={4} style={{ margin: '8px 0 4px' }}>
            {scan.name}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
            {scan.target} · {meta.label} · completed {formatDateTime(scan.completedAt)}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={exportJson}>
            JSON
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={exportPdf}>
            PDF
          </Button>
        </Space>
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="Risk posture" style={{ height: '100%' }}>
            <Flex wrap gap={20} align="center">
              <Progress type="dashboard" percent={scan.riskScore} strokeColor={bandHex} size={120} />
              <div style={{ minWidth: 160, flex: 1 }}>
                <Typography.Title level={5} style={{ margin: 0, color: bandHex }}>
                  {band.label}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Weighted across {findings.length} findings and exploit validation.
                </Typography.Text>
                <div style={{ marginTop: 12 }}>
                  <SeverityBar counts={scan.counts} />
                </div>
              </div>
            </Flex>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Breakdown" style={{ height: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={12}>
                <Statistic title="Total findings" value={findings.length} />
              </Col>
              <Col xs={12}>
                <Statistic
                  title="Critical + High"
                  value={criticalHigh}
                  valueStyle={{ color: SEVERITY_META.critical.hex }}
                />
              </Col>
              <Col xs={12}>
                <Statistic
                  title="Validated"
                  value={validated}
                  valueStyle={{ color: SEVERITY_META.low.hex }}
                />
              </Col>
              <Col xs={12}>
                <Statistic title="CVEs matched" value={cves} />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="AI analysis" extra={<Typography.Text type="secondary">Vertex AI</Typography.Text>} style={{ height: '100%' }}>
            <Typography.Text strong>{ai.headline}</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
              {ai.summary}
            </Typography.Paragraph>
            {ai.topRisks.length > 0 && (
              <ul style={{ paddingInlineStart: 18, margin: '0 0 12px', fontSize: 12 }}>
                {ai.topRisks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <Flex justify="space-between">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {ai.model}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {Math.round(ai.confidence * 100)}% confidence
              </Typography.Text>
            </Flex>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="By severity">
            <SeverityDonut counts={scan.counts} size={200} />
            <div style={{ marginTop: 16 }}>
              <SeverityBar counts={scan.counts} showLegend />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="By category">
            <FindingsByCategoryBar data={findingsByCategory} />
          </Card>
        </Col>
      </Row>

      <Card title={`Findings (${findings.length})`}>
        <FindingsTable findings={findings} />
      </Card>

      <Card title="Scan timeline">
        <Timeline
          items={events.map((ev) => ({
            key: ev.id,
            color: TIMELINE_COLOR[ev.level],
            children: (
              <Space size={8} wrap>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDateTime(ev.ts)}
                </Typography.Text>
                <span>{ev.message}</span>
              </Space>
            ),
          }))}
        />
      </Card>
    </Space>
  )
}
