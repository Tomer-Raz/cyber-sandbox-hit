import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api } from '@/api'
import { SCAN_TYPE_META, STATUS_META, SEVERITY_META, isRunning } from '@/lib/constants'
import { formatDateTime, formatDuration, riskBand } from '@/lib/format'
import { toast } from '@/lib/notify'
import type { AdminScan } from '@/types'

const REFRESH_MS = 8000

const columns: ColumnsType<AdminScan> = [
  {
    title: 'Scan',
    dataIndex: 'name',
    key: 'name',
    render: (_, s) => (
      <div style={{ minWidth: 0 }}>
        <Link to={`/scans/${s.id}`}>{s.name}</Link>
        <div style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', wordBreak: 'break-all' }}>
          {s.target}
        </div>
      </div>
    ),
  },
  {
    title: 'Run by',
    dataIndex: 'requestedBy',
    key: 'requestedBy',
    width: 200,
    render: (_, s) => (
      <div style={{ minWidth: 0 }}>
        <div>{s.requestedBy}</div>
        <div style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', wordBreak: 'break-all' }}>
          {s.requestedByEmail}
        </div>
      </div>
    ),
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 130,
    render: (_, s) => <Tag color={STATUS_META[s.status].color}>{STATUS_META[s.status].label}</Tag>,
  },
  {
    title: 'Type',
    dataIndex: 'scanType',
    key: 'scanType',
    width: 120,
    responsive: ['lg'],
    render: (_, s) => (
      <Tag color={SCAN_TYPE_META[s.scanType].tag}>{SCAN_TYPE_META[s.scanType].label}</Tag>
    ),
  },
  {
    title: 'Started',
    dataIndex: 'startedAt',
    key: 'startedAt',
    width: 180,
    // Absolute rather than relative: the point of this view is auditing when
    // something ran, and "3 days ago" is the wrong precision for that.
    sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    defaultSortOrder: 'descend',
    render: (_, s) => formatDateTime(s.startedAt ?? s.createdAt),
  },
  {
    title: 'Duration',
    dataIndex: 'durationSec',
    key: 'durationSec',
    width: 110,
    align: 'right',
    responsive: ['lg'],
    render: (_, s) => formatDuration(s.durationSec),
  },
  {
    title: 'Findings',
    dataIndex: 'totalFindings',
    key: 'totalFindings',
    width: 100,
    align: 'right',
    responsive: ['md'],
    sorter: (a, b) => a.totalFindings - b.totalFindings,
  },
  {
    title: 'Risk',
    dataIndex: 'riskScore',
    key: 'riskScore',
    width: 90,
    align: 'right',
    responsive: ['md'],
    sorter: (a, b) => a.riskScore - b.riskScore,
    render: (_, s) => (
      <span style={{ color: SEVERITY_META[riskBand(s.riskScore).tone].hex, fontWeight: 500 }}>
        {s.riskScore}
      </span>
    ),
  },
]

export default function AdminScans() {
  const [scans, setScans] = useState<AdminScan[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState<string>('all')

  useEffect(() => {
    let active = true
    const load = (initial: boolean) =>
      api
        .listAdminScans()
        .then((rows) => active && setScans(rows))
        .catch((err: Error) => {
          if (active && initial) toast.error('Could not load scans', err.message)
        })
        .finally(() => active && initial && setLoading(false))

    load(true)
    const iv = setInterval(() => load(false), REFRESH_MS)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [])

  const owners = useMemo(
    () => [...new Set(scans.map((s) => s.requestedByEmail))].sort(),
    [scans],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scans
      .filter((s) => owner === 'all' || s.requestedByEmail === owner)
      .filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          s.target.toLowerCase().includes(needle) ||
          s.requestedBy.toLowerCase().includes(needle) ||
          s.requestedByEmail.toLowerCase().includes(needle),
      )
  }, [scans, owner, q])

  const activeCount = scans.filter((s) => isRunning(s.status)).length

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          All scans
        </Typography.Title>
        <Typography.Text type="secondary">
          {scans.length} across {owners.length} {owners.length === 1 ? 'user' : 'users'} ·{' '}
          {activeCount} active
        </Typography.Text>
      </div>

      <Space wrap>
        <Input.Search
          allowClear
          placeholder="Search target or user…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 300 }}
        />
        <Select
          value={owner}
          onChange={setOwner}
          style={{ width: 260 }}
          options={[
            { value: 'all', label: `All users (${scans.length})` },
            ...owners.map((email) => ({
              value: email,
              label: `${email} (${scans.filter((s) => s.requestedByEmail === email).length})`,
            })),
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        size="middle"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
      />
    </Space>
  )
}
