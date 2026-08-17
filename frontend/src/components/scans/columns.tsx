import { Link } from 'react-router-dom'
import { Tag, Tooltip } from 'antd'
import { WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { SCAN_TYPE_META, SEVERITY_META, STATUS_META } from '@/lib/constants'
import { formatDateTime, formatDuration, formatRelativeTime, riskBand } from '@/lib/format'
import type { AdminScan, Scan } from '@/types'
import { TwoLine } from '@/components/ui/TwoLine'

type ScanColumns<T extends Scan> = ColumnsType<T>[number]

/**
 * Column definitions shared by every scan table. Each view composes the keys it
 * needs, in its own order, via `scanColumns()`.
 */
const REGISTRY = {
  name: {
    title: 'Scan',
    dataIndex: 'name',
    render: (_, s) => <TwoLine primary={<Link to={`/scans/${s.id}`}>{s.name}</Link>} secondary={s.target} />,
  },
  status: {
    title: 'Status',
    dataIndex: 'status',
    width: 130,
    render: (_, s) => <Tag color={STATUS_META[s.status].color}>{STATUS_META[s.status].label}</Tag>,
  },
  anomaly: {
    title: 'Anomaly',
    dataIndex: 'isAnomaly',
    width: 90,
    align: 'center',
    responsive: ['md'],
    render: (_, s) =>
      s.isAnomaly ? (
        <Tooltip
          title="This scan looks very different from past scans of this target (findings, risk, or duration). Open the report for details."
          styles={{ body: { fontSize: 12, maxWidth: 320 } }}
        >
          <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />
        </Tooltip>
      ) : null,
  },
  scanType: {
    title: 'Type',
    dataIndex: 'scanType',
    width: 120,
    responsive: ['lg'],
    render: (_, s) => <Tag color={SCAN_TYPE_META[s.scanType].tag}>{SCAN_TYPE_META[s.scanType].label}</Tag>,
  },
  totalFindings: {
    title: 'Findings',
    dataIndex: 'totalFindings',
    width: 100,
    align: 'right',
    responsive: ['md'],
    sorter: (a, b) => a.totalFindings - b.totalFindings,
  },
  riskScore: {
    title: 'Risk',
    dataIndex: 'riskScore',
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
  createdAt: {
    title: 'Created',
    dataIndex: 'createdAt',
    width: 140,
    responsive: ['lg'],
    render: (_, s) => formatRelativeTime(s.createdAt),
  },
  // Absolute rather than relative: this view exists for auditing when something
  // ran, and "3 days ago" is the wrong precision for that.
  startedAt: {
    title: 'Started',
    dataIndex: 'startedAt',
    width: 180,
    sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    defaultSortOrder: 'descend',
    render: (_, s) => formatDateTime(s.startedAt ?? s.createdAt),
  },
  durationSec: {
    title: 'Duration',
    dataIndex: 'durationSec',
    width: 110,
    align: 'right',
    responsive: ['lg'],
    render: (_, s) => formatDuration(s.durationSec),
  },
} satisfies Record<string, ScanColumns<Scan>>

const OWNER: ScanColumns<AdminScan> = {
  title: 'Run by',
  dataIndex: 'requestedBy',
  width: 200,
  render: (_, s) => <TwoLine primary={s.requestedBy} secondary={s.requestedByEmail} />,
}

export type ScanColumnKey = keyof typeof REGISTRY | 'requestedBy'

export function scanColumns<T extends Scan>(keys: ScanColumnKey[]): ColumnsType<T> {
  return keys.map((key) => ({
    key,
    ...((key === 'requestedBy' ? OWNER : REGISTRY[key]) as ScanColumns<T>),
  }))
}
