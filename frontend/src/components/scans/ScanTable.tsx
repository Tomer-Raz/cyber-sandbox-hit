import type { Scan } from '@/types'
import { DataTable } from '@/components/ui/DataTable'
import { scanColumns } from './columns'

const COLUMNS = scanColumns<Scan>([
  'name',
  'status',
  'anomaly',
  'scanType',
  'totalFindings',
  'riskScore',
  'createdAt',
])

export function ScanTable({
  data,
  loading,
  pageSize,
}: {
  data: Scan[]
  loading?: boolean
  pageSize?: number
}) {
  return <DataTable<Scan> columns={COLUMNS} dataSource={data} loading={loading} pageSize={pageSize} />
}
