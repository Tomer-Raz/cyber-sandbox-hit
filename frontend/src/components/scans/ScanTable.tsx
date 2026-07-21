import { Link } from 'react-router-dom'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SCAN_TYPE_META, SEVERITY_META, STATUS_META } from '@/lib/constants'
import { formatRelativeTime, riskBand } from '@/lib/format'
import type { Scan } from '@/types'

/**
 * Shared scan table. Secondary columns drop away below `md`/`lg`
 * so the table never forces horizontal scrolling on a phone.
 */
export function ScanTable({
  data,
  loading,
  pageSize,
}: {
  data: Scan[]
  loading?: boolean
  pageSize?: number
}) {
  const columns: ColumnsType<Scan> = [
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
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      responsive: ['lg'],
      render: (_, s) => formatRelativeTime(s.createdAt),
    },
  ]

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={data}
      loading={loading}
      size="middle"
      pagination={pageSize ? { pageSize, hideOnSinglePage: true, showSizeChanger: false } : false}
    />
  )
}
