import { useEffect, useMemo, useState } from 'react'
import { Alert, Input, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api } from '@/api'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { toast } from '@/lib/notify'
import { ADMIN_ROLE, type AdminUser } from '@/types'

const columns: ColumnsType<AdminUser> = [
  {
    title: 'User',
    dataIndex: 'name',
    key: 'name',
    render: (_, u) => (
      <div style={{ minWidth: 0 }}>
        <div>{u.name}</div>
        <div style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.45)', wordBreak: 'break-all' }}>
          {u.email}
        </div>
      </div>
    ),
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return users
    return users.filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle),
    )
  }, [users, q])

  const adminCount = users.filter((u) => u.role === ADMIN_ROLE).length

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Users
        </Typography.Title>
        <Typography.Text type="secondary">
          {users.length} total · {adminCount} admin
        </Typography.Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Read-only"
        description="Names and email addresses come from each person's Google account, and the admin role is granted in GCP IAM. Neither can be edited here."
      />

      <Input.Search
        allowClear
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 360 }}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        size="middle"
        pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
      />
    </Space>
  )
}
