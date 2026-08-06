import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import { useScansStore } from '@/store/scansStore'
import { isRunning } from '@/lib/constants'
import { filterBySearch, usePolling } from '@/lib/hooks'
import type { Scan } from '@/types'
import { ScanTable } from '@/components/scans/ScanTable'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'

type Filter = 'all' | 'running' | 'completed' | 'failed'

const FILTERS: Record<Filter, { label: string; match: (s: Scan) => boolean }> = {
  all: { label: 'All', match: () => true },
  running: { label: 'Running', match: (s) => isRunning(s.status) },
  completed: { label: 'Completed', match: (s) => s.status === 'completed' },
  failed: {
    label: 'Failed / canceled',
    match: (s) => s.status === 'failed' || s.status === 'canceled',
  },
}

const KEYS = Object.keys(FILTERS) as Filter[]

export default function ScansList() {
  const navigate = useNavigate()
  const { scans, fetchScans, loaded } = useScansStore()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  usePolling(() => void fetchScans({ silent: loaded }), 4000)

  const counts = useMemo(
    () =>
      Object.fromEntries(
        KEYS.map((f) => [f, scans.filter(FILTERS[f].match).length]),
      ) as Record<Filter, number>,
    [scans],
  )

  const filtered = filterBySearch(scans.filter(FILTERS[filter].match), q, (s) => [
    s.name,
    s.target,
  ]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title="Scans"
        subtitle={`${counts.all} total · ${counts.running} active`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/scans/new')}>
            New scan
          </Button>
        }
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search name or target…"
        selects={[
          {
            value: filter,
            onChange: setFilter,
            options: KEYS.map((f) => ({ value: f, label: `${FILTERS[f].label} (${counts[f]})` })),
          },
        ]}
      />

      <ScanTable data={filtered} loading={!loaded} pageSize={10} />
    </Space>
  )
}
