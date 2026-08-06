import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileTextOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Popconfirm, Progress, Space, Steps, Tag, Typography } from 'antd'
import { api, type StatusPayload } from '@/api'
import { useScansStore } from '@/store/scansStore'
import { toast } from '@/lib/notify'
import {
  EVENT_LEVEL_META,
  isRunning,
  PHASES,
  SCAN_TYPE_META,
  STATUS_META,
  TERMINAL_STATUSES,
} from '@/lib/constants'
import { usePolling } from '@/lib/hooks'
import { formatClock, formatDuration, formatRelativeTime } from '@/lib/format'
import { SeverityBar } from '@/components/charts/SeverityBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { ResultPage } from '@/components/ui/ResultPage'

export default function ScanStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const upsert = useScansStore((s) => s.upsert)
  const [data, setData] = useState<StatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Navigating between two scan routes reuses this component, so clear the
  // previous scan's data rather than showing it under the new id.
  useEffect(() => {
    setData(null)
    setError(null)
  }, [id])

  usePolling(
    async () => {
      if (!id) return false
      try {
        const d = await api.getScanStatus(id)
        setData(d)
        upsert(d.scan)
        return !TERMINAL_STATUSES.includes(d.scan.status)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan not found')
        return false
      }
    },
    1500,
    [id],
  )

  // Keep the log pinned to the newest line, unless the user has scrolled up to
  // read — polling every 1.5s would otherwise yank them back down mid-read.
  const followTail = useRef(true)

  useEffect(() => {
    const el = logRef.current
    if (el && followTail.current) el.scrollTop = el.scrollHeight
  }, [data?.events.length])

  const handleLogScroll = () => {
    const el = logRef.current
    if (el) followTail.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const handleCancel = async () => {
    if (!id) return
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
      <ResultPage
        status="404"
        title="Scan not found"
        subTitle={error}
        actions={[{ label: 'Back to scans', to: '/scans', primary: true }]}
      />
    )
  }

  if (!data) return <Card loading />

  const { scan, events } = data
  const running = isRunning(scan.status)
  const done = scan.status === 'completed'

  const phaseIndex = done
    ? PHASES.length
    : Math.max(
        0,
        PHASES.findIndex((p) => p.key === scan.phase),
      )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        back={{ to: '/scans', label: 'Scans' }}
        title={scan.name}
        subtitle={`${scan.target} · ${SCAN_TYPE_META[scan.scanType].label} · ${scan.region}`}
        extra={
          <>
            <Tag color={STATUS_META[scan.status].color}>{STATUS_META[scan.status].label}</Tag>
            {running && (
              <Popconfirm
                title="Cancel this scan?"
                description="The container is torn down immediately and partial results discarded."
                okText="Cancel scan"
                okButtonProps={{ danger: true }}
                cancelText="Keep running"
                onConfirm={handleCancel}
              >
                <Button danger icon={<StopOutlined />}>
                  Cancel
                </Button>
              </Popconfirm>
            )}
            {done && (
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                onClick={() => navigate(`/scans/${scan.id}/report`)}
              >
                View report
              </Button>
            )}
          </>
        }
      />

      {done && (
        <Card>
          <Flex wrap gap={24} align="center" justify="space-between">
            <Space direction="vertical" size={2}>
              <Typography.Text strong>Scan complete</Typography.Text>
              <Typography.Text type="secondary">
                {scan.totalFindings} findings · risk score {scan.riskScore} ·{' '}
                {formatDuration(scan.durationSec)}
              </Typography.Text>
            </Space>
            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <SeverityBar counts={scan.counts} showLegend />
            </div>
          </Flex>
        </Card>
      )}

      <Card>
        <Flex wrap gap={16} align="baseline" justify="space-between" style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            {running ? 'In progress' : STATUS_META[scan.status].label}
          </Typography.Text>
          <Typography.Text type="secondary">
            started {formatRelativeTime(scan.startedAt)}
            {scan.durationSec != null && ` · took ${formatDuration(scan.durationSec)}`}
          </Typography.Text>
        </Flex>

        <Progress
          percent={scan.progress}
          status={
            scan.status === 'failed' ? 'exception' : done ? 'success' : running ? 'active' : 'normal'
          }
        />

        <div style={{ marginTop: 24 }}>
          <Steps
            size="small"
            current={phaseIndex}
            status={scan.status === 'failed' ? 'error' : undefined}
            items={PHASES.map((p) => ({ title: p.label, description: p.description }))}
          />
        </div>
      </Card>

      <Card
        title="Execution log"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {running ? `streaming · ${events.length} lines` : `${events.length} lines`}
          </Typography.Text>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div
          ref={logRef}
          onScroll={handleLogScroll}
          className="mono"
          style={{ maxHeight: 520, overflowY: 'auto', padding: 16, fontSize: 12, lineHeight: 1.9 }}
        >
          {events.map((ev) => {
            const level = EVENT_LEVEL_META[ev.level]
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'rgba(0, 0, 0, 0.35)', flexShrink: 0 }}>
                  {formatClock(ev.ts)}
                </span>
                <span style={{ color: level.hex, flexShrink: 0 }}>{level.glyph}</span>
                <span style={{ color: level.hex, minWidth: 0, wordBreak: 'break-word' }}>
                  {ev.message}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </Space>
  )
}
