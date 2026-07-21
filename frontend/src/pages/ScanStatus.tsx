import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutlined, FileTextOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Popconfirm, Progress, Result, Space, Steps, Tag, Typography } from 'antd'
import { api, type StatusPayload } from '@/api'
import { useScansStore } from '@/store/scansStore'
import { toast } from '@/lib/notify'
import { isRunning, PHASES, SCAN_TYPE_META, STATUS_META } from '@/lib/constants'
import { formatClock, formatDuration, formatRelativeTime } from '@/lib/format'
import { SeverityBar } from '@/components/charts/SeverityBar'
import type { ScanEvent } from '@/types'

const TERMINAL = ['completed', 'failed', 'canceled']

const LEVEL_COLOR: Record<ScanEvent['level'], string> = {
  info: 'rgba(0, 0, 0, 0.65)',
  success: '#52c41a',
  warn: '#faad14',
  error: '#cf1322',
}

const LEVEL_GLYPH: Record<ScanEvent['level'], string> = {
  info: '›',
  success: '✓',
  warn: '⚠',
  error: '✗',
}

export default function ScanStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const upsert = useScansStore((s) => s.upsert)
  const [data, setData] = useState<StatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Keep the log pinned to the newest line.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [data?.events.length])

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
      <Result
        status="404"
        title="Scan not found"
        subTitle={error}
        extra={
          <Button type="primary" onClick={() => navigate('/scans')}>
            Back to scans
          </Button>
        }
      />
    )
  }

  if (!data) return <Card loading />

  const { scan, events } = data
  const running = isRunning(scan.status)
  const done = scan.status === 'completed'
  const meta = SCAN_TYPE_META[scan.scanType]

  const phaseIndex = done
    ? PHASES.length
    : Math.max(
        0,
        PHASES.findIndex((p) => p.key === scan.phase),
      )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Flex wrap gap={16} align="flex-end" justify="space-between">
        <div style={{ minWidth: 0 }}>
          <Link to="/scans">
            <ArrowLeftOutlined /> Scans
          </Link>
          <Typography.Title level={4} style={{ margin: '8px 0 4px' }}>
            {scan.name}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
            {scan.target} · {meta.label} · {scan.region}
          </Typography.Text>
        </div>
        <Space wrap>
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
        </Space>
      </Flex>

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
            scan.status === 'failed'
              ? 'exception'
              : done
                ? 'success'
                : running
                  ? 'active'
                  : 'normal'
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
            {running ? 'streaming' : `${events.length} lines`}
          </Typography.Text>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div
          ref={logRef}
          className="mono"
          style={{ maxHeight: 340, overflowY: 'auto', padding: 16, fontSize: 12, lineHeight: 1.9 }}
        >
          {events.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'rgba(0, 0, 0, 0.35)', flexShrink: 0 }}>
                {formatClock(ev.ts)}
              </span>
              <span style={{ color: LEVEL_COLOR[ev.level], flexShrink: 0 }}>
                {LEVEL_GLYPH[ev.level]}
              </span>
              <span style={{ color: LEVEL_COLOR[ev.level], minWidth: 0, wordBreak: 'break-word' }}>
                {ev.message}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Space>
  )
}
