import { useMemo, useState } from 'react'
import { Col, Descriptions, Input, Row, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import type { Finding, Severity } from '@/types'

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

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return findings
      .filter((f) => sev === 'all' || f.severity === sev)
      .filter(
        (f) =>
          !needle ||
          f.name.toLowerCase().includes(needle) ||
          f.category.toLowerCase().includes(needle) ||
          f.cveIds.some((c) => c.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) =>
          SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank || b.cvss - a.cvss,
      )
  }, [findings, sev, q])

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
        <div style={{ minWidth: 0 }}>
          <div>{f.name}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {f.category}
            {f.cveIds.length > 0 && ` · ${f.cveIds[0]}`}
          </Typography.Text>
        </div>
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
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={14} md={10}>
          <Input.Search
            allowClear
            placeholder="Search findings, CVEs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Col>
        <Col xs={24} sm={10} md={8}>
          <Select
            style={{ width: '100%' }}
            value={sev}
            onChange={setSev}
            options={[
              { value: 'all', label: 'All severities' },
              ...SEVERITY_ORDER.map((s) => ({ value: s, label: SEVERITY_META[s].label })),
            ]}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        size="middle"
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        expandable={{ expandedRowRender: (f) => <FindingDetail f={f} /> }}
      />
    </Space>
  )
}
