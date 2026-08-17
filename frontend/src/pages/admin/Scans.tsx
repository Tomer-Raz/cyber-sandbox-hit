import { useMemo, useState } from 'react'
import { Space } from 'antd'
import { api } from '@/api'
import { isRunning } from '@/lib/constants'
import { filterBySearch, usePolling } from '@/lib/hooks'
import { toast } from '@/lib/notify'
import type { AdminScan } from '@/types'
import { scanColumns } from '@/components/scans/columns'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'

const REFRESH_MS = 8000

const COLUMNS = scanColumns<AdminScan>([
  'name',
  'requestedBy',
  'status',
  'anomaly',
  'scanType',
  'startedAt',
  'durationSec',
  'totalFindings',
  'riskScore',
])

export default function AdminScans() {
  const [scans, setScans] = useState<AdminScan[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('all')

  usePolling(async () => {
    try {
      setScans(await api.listAdminScans())
    } catch (err) {
      // Only the first failure is worth a toast; the poll keeps retrying quietly.
      if (loading) toast.error('Could not load scans', (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, REFRESH_MS)

  const owners = useMemo(() => [...new Set(scans.map((s) => s.requestedByEmail))].sort(), [scans])

  const filtered = filterBySearch(
    scans.filter((s) => owner === 'all' || s.requestedByEmail === owner),
    q,
    (s) => [s.name, s.target, s.requestedBy, s.requestedByEmail],
  )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title="All scans"
        subtitle={`${scans.length} across ${owners.length} ${owners.length === 1 ? 'user' : 'users'} · ${scans.filter((s) => isRunning(s.status)).length} active`}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search target or user…"
        inline
        searchWidth={300}
        selects={[
          {
            value: owner,
            onChange: setOwner,
            width: 260,
            options: [
              { value: 'all', label: `All users (${scans.length})` },
              ...owners.map((email) => ({
                value: email,
                label: `${email} (${scans.filter((s) => s.requestedByEmail === email).length})`,
              })),
            ],
          },
        ]}
      />

      <DataTable<AdminScan>
        columns={COLUMNS}
        dataSource={filtered}
        loading={loading}
        pageSize={15}
        scroll={{ x: 'max-content' }}
      />
    </Space>
  )
}
