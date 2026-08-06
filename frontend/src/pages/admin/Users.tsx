import { useEffect, useState } from 'react'
import { Alert, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api } from '@/api'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { filterBySearch } from '@/lib/hooks'
import { toast } from '@/lib/notify'
import { ADMIN_ROLE, type AdminUser } from '@/types'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { TwoLine } from '@/components/ui/TwoLine'

const columns: ColumnsType<AdminUser> = [
  {
    title: 'User',
    dataIndex: 'name',
    key: 'name',
    render: (_, u) => <TwoLine primary={u.name} secondary={u.email} />,
  },
  {
    title: 'Role',
    dataIndex: 'role',
    key: 'role',
    width: 110,
    render: (_, u) => (
      <Tag color={u.role === ADMIN_ROLE ? 'gold' : 'default'}>
        {u.role === ADMIN_ROLE ? 'Admin' : 'User'}
      </Tag>
    ),
  },
  {
    title: 'Scans',
    dataIndex: 'scanCount',
    key: 'scanCount',
    width: 90,
    align: 'right',
    responsive: ['md'],
    sorter: (a, b) => a.scanCount - b.scanCount,
  },
  {
    title: 'Last scan',
    dataIndex: 'lastScanAt',
    key: 'lastScanAt',
    width: 150,
    responsive: ['md'],
    render: (_, u) => formatRelativeTime(u.lastScanAt),
  },
  {
    title: 'Member since',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 170,
    responsive: ['lg'],
    sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    render: (_, u) => formatDateTime(u.createdAt),
  },
]

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let active = true
    api
      .listAdminUsers()
      .then((rows) => active && setUsers(rows))
      .catch((err: Error) => active && toast.error('Could not load users', err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title="Users"
        subtitle={`${users.length} total · ${users.filter((u) => u.role === ADMIN_ROLE).length} admin`}
      />

      <Alert
        type="info"
        showIcon
        message="Read-only"
        description="Names and email addresses come from each person's Google account, and the admin role is granted in GCP IAM. Neither can be edited here."
      />

      <FilterBar search={q} onSearch={setQ} placeholder="Search name or email…" />

      <DataTable<AdminUser>
        columns={columns}
        dataSource={filterBySearch(users, q, (u) => [u.name, u.email])}
        loading={loading}
        pageSize={15}
      />
    </Space>
  )
}
