import { useCallback, useEffect, useState } from 'react'
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
import { UserDetailDrawer } from './UserDetailDrawer'

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
    title: 'Status',
    dataIndex: 'blockedAt',
    key: 'status',
    width: 110,
    render: (_, u) => (
      <Tag color={u.blockedAt ? 'red' : 'green'}>{u.blockedAt ? 'Blocked' : 'Active'}</Tag>
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
    title: 'Last sign-in',
    dataIndex: 'lastLoginAt',
    key: 'lastLoginAt',
    width: 150,
    responsive: ['md'],
    render: (_, u) => formatRelativeTime(u.lastLoginAt),
  },
  {
    title: 'Last scan',
    dataIndex: 'lastScanAt',
    key: 'lastScanAt',
    width: 150,
    responsive: ['lg'],
    render: (_, u) => formatRelativeTime(u.lastScanAt),
  },
  {
    title: 'Member since',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 170,
    responsive: ['xl'],
    sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    render: (_, u) => formatDateTime(u.createdAt),
  },
]

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [openUserId, setOpenUserId] = useState<string | null>(null)

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

  // Patched in place rather than refetching, so blocking someone doesn't reset
  // the reader's sort, search or page.
  const handleUserChanged = useCallback((updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
  }, [])

  const blockedCount = users.filter((u) => u.blockedAt).length

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title="Users"
        subtitle={`${users.length} total · ${users.filter((u) => u.role === ADMIN_ROLE).length} admin${
          blockedCount ? ` · ${blockedCount} blocked` : ''
        }`}
      />

      <Alert
        type="info"
        showIcon
        message="Identity is managed upstream"
        description="Names and email addresses come from each person's Google account, and the admin role is granted in GCP IAM. Blocking is the one thing controlled here — select a user to see their activity."
      />

      <FilterBar search={q} onSearch={setQ} placeholder="Search name or email…" />

      <DataTable<AdminUser>
        columns={columns}
        dataSource={filterBySearch(users, q, (u) => [u.name, u.email])}
        loading={loading}
        pageSize={15}
        onRow={(u) => ({ onClick: () => setOpenUserId(u.id), style: { cursor: 'pointer' } })}
      />

      <UserDetailDrawer
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
        onUserChanged={handleUserChanged}
      />
    </Space>
  )
}
