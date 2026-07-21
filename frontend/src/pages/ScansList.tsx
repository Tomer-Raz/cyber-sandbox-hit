import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Col, Flex, Input, Row, Select, Space, Typography } from 'antd'
import { useScansStore } from '@/store/scansStore'
import { isRunning } from '@/lib/constants'
import type { Scan } from '@/types'
import { ScanTable } from '@/components/scans/ScanTable'

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
  const navigate = useNavigate()
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

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Flex wrap gap={16} align="flex-end" justify="space-between">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Scans
          </Typography.Title>
          <Typography.Text type="secondary">
            {counts.all} total · {counts.running} active
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/scans/new')}>
          New scan
        </Button>
      </Flex>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={14} md={10} lg={8}>
          <Input.Search
            allowClear
            placeholder="Search name or target…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
        <Col xs={24} sm={10} md={8} lg={6}>
          <Select
            style={{ width: '100%' }}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All (${counts.all})` },
              { value: 'running', label: `Running (${counts.running})` },
              { value: 'completed', label: `Completed (${counts.completed})` },
              { value: 'failed', label: `Failed / canceled (${counts.failed})` },
            ]}
          />
        </Col>
      </Row>

      <ScanTable data={filtered} loading={!loaded} pageSize={10} />
    </Space>
  )
}
