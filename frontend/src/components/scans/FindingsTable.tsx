import { useState } from 'react'
import { Descriptions, Space, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import { filterBySearch } from '@/lib/hooks'
import type { Finding, Severity } from '@/types'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/FilterBar'
import { TwoLine } from '@/components/ui/TwoLine'

function FindingDetail({ f }: { f: Finding }) {
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph style={{ marginBottom: 0 }}>{f.description}</Typography.Paragraph>

      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, md: 2 }}
        items={[
          {
            key: 'endpoint',
            label: 'Endpoint',
            children: (
              <span className="mono" style={{ wordBreak: 'break-all' }}>
                {f.method} {f.endpoint}
              </span>
            ),
          },
          {
            key: 'weakness',
            label: 'Weakness',
            children: (
              <span className="mono">
                {f.cweId}
                {f.cveIds.length > 0 && ` · ${f.cveIds.join(', ')}`}
              </span>
            ),
          },
        ]}
      />

      <div>
        <Typography.Text strong>Evidence</Typography.Text>
        <div
          className="mono"
          style={{
            marginTop: 6,
            padding: '8px 10px',
            background: '#fafafa',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            fontSize: 12,
            wordBreak: 'break-all',
          }}
        >
          {f.evidence}
        </div>
      </div>

      <div>
        <Typography.Text strong>Recommendation</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0 }}>
          {f.recommendation}
        </Typography.Paragraph>
      </div>

      <Space wrap size={12}>
        {f.references.map((r) => (
          <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
            {r.label}
          </a>
        ))}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          found {formatDateTime(f.discoveredAt)}
        </Typography.Text>
      </Space>
    </Space>
  )
}

export function FindingsTable({ findings }: { findings: Finding[] }) {
  const [q, setQ] = useState('')
  const [sev, setSev] = useState<Severity | 'all'>('all')

  const rows = filterBySearch(
    findings.filter((f) => sev === 'all' || f.severity === sev),
    q,
    (f) => [f.name, f.category, ...f.cveIds],
  ).sort(
    (a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank || b.cvss - a.cvss,
  )

  const columns: ColumnsType<Finding> = [
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 110,
      sorter: (a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank,
      render: (_, f) => (
        <Tag color={SEVERITY_META[f.severity].tag}>{SEVERITY_META[f.severity].label}</Tag>
      ),
    },
    {
      title: 'Finding',
      dataIndex: 'name',
      key: 'name',
      render: (_, f) => (
        <TwoLine
          breakAll={false}
          primary={f.name}
          secondary={`${f.category}${f.cveIds.length > 0 ? ` · ${f.cveIds[0]}` : ''}`}
        />
      ),
    },
    {
      title: 'CVSS',
      dataIndex: 'cvss',
      key: 'cvss',
      width: 90,
      align: 'right',
      responsive: ['md'],
      sorter: (a, b) => a.cvss - b.cvss,
      render: (v: number) => v.toFixed(1),
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 150,
      responsive: ['lg'],
      render: (_, f) => (
        <Space size={4} wrap>
          {f.validated && <Tag color="green">verified</Tag>}
          <Tag>{f.confidence}</Tag>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search findings, CVEs…"
        selects={[
          {
            value: sev,
            onChange: setSev,
            options: [
              { value: 'all' as const, label: 'All severities' },
              ...SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_META[s].label })),
            ],
          },
        ]}
      />

      <DataTable<Finding>
        columns={columns}
        dataSource={rows}
        pageSize={10}
        expandable={{ expandedRowRender: (f) => <FindingDetail f={f} /> }}
      />
    </Space>
  )
}
