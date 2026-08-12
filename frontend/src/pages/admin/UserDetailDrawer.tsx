import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Popconfirm,
  Space,
  Tabs,
  Tag,
  Timeline,
  Typography,
  theme,
} from 'antd'
import { api } from '@/api'
import { formatDateTime, formatRelativeTime, initialsFromName } from '@/lib/format'
import { toast } from '@/lib/notify'
import { ADMIN_ROLE, type ActivityEvent, type AdminUser, type AdminUserDetail } from '@/types'
import { CenteredSpin } from '@/components/ui/CenteredSpin'

const ACTION_LABELS: Record<string, string> = {
  signed_in: 'Signed in',
  scan_started: 'Started a scan',
  scan_cancelled: 'Cancelled a scan',
  user_blocked: 'Account blocked',
  user_unblocked: 'Account unblocked',
}

const ACTION_COLORS: Record<string, string> = {
  scan_started: 'blue',
  scan_cancelled: 'orange',
  user_blocked: 'red',
  user_unblocked: 'green',
}

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

/** Renders whatever extras the backend attached, without needing to know them. */
function EventDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return null
  return (
    <div style={{ marginTop: 4 }}>
      {entries.map(([key, value]) => (
        <Typography.Text key={key} type="secondary" style={{ fontSize: 12, marginRight: 12 }}>
          {key.replace(/_/g, ' ')}: <Typography.Text code>{String(value)}</Typography.Text>
        </Typography.Text>
      ))}
    </div>
  )
}

function EventTimeline({ events, empty }: { events: ActivityEvent[]; empty: string }) {
  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />

  return (
    <Timeline
      items={events.map((event, i) => ({
        key: i,
        color: ACTION_COLORS[event.action] ?? 'gray',
        children: (
          <>
            <Flex gap={8} align="baseline" wrap>
              <Typography.Text strong>{labelFor(event.action)}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatRelativeTime(event.timestamp)}
              </Typography.Text>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatDateTime(event.timestamp)}
            </Typography.Text>
            <EventDetails details={event.details} />
          </>
        ),
      }))}
    />
  )
}

interface Props {
  userId: string | null
  onClose: () => void
  onUserChanged: (user: AdminUser) => void
}

export function UserDetailDrawer({ userId, onClose, onUserChanged }: Props) {
  const { token } = theme.useToken()
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setDetail(null)
    api
      .getAdminUser(userId)
      .then((d) => active && setDetail(d))
      .catch((err: Error) => active && toast.error('Could not load user', err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [userId])

  const toggleBlocked = useCallback(async () => {
    if (!detail) return
    const blocking = !detail.blockedAt
    setSaving(true)
    try {
      const updated = await api.setAdminUserBlocked(detail.id, blocking)
      setDetail({ ...detail, ...updated })
      onUserChanged(updated)
      toast.success(blocking ? 'User blocked' : 'User unblocked')
    } catch (err) {
      toast.error(
        blocking ? 'Could not block user' : 'Could not unblock user',
        (err as Error).message,
      )
    } finally {
      setSaving(false)
    }
  }, [detail, onUserChanged])

  const isAdmin = detail?.role === ADMIN_ROLE
  const blocked = !!detail?.blockedAt

  return (
    <Drawer
      open={!!userId}
      onClose={onClose}
      width={620}
      destroyOnClose
      title={detail ? detail.name : 'User'}
    >
      {loading && <CenteredSpin minHeight="240px" />}

      {detail && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Flex gap={16} align="center" wrap>
            <Avatar size={56} style={{ backgroundColor: token.colorPrimary }}>
              {initialsFromName(detail.name)}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {detail.name}
              </Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
                {detail.email}
              </Typography.Text>
            </div>
            <Space style={{ marginLeft: 'auto' }}>
              <Tag color={isAdmin ? 'gold' : 'default'}>{isAdmin ? 'Admin' : 'User'}</Tag>
              <Tag color={blocked ? 'red' : 'green'}>{blocked ? 'Blocked' : 'Active'}</Tag>
            </Space>
          </Flex>

          {blocked && (
            <Alert
              type="error"
              showIcon
              message="Account blocked"
              description={`Blocked ${formatRelativeTime(detail.blockedAt)}${
                detail.blockedByEmail ? ` by ${detail.blockedByEmail}` : ''
              }. Their credential is rejected on the next request.`}
            />
          )}

          <Descriptions
            size="small"
            bordered
            column={1}
            items={[
              { key: 'role', label: 'Role', children: isAdmin ? 'Admin' : 'User' },
              {
                key: 'created',
                label: 'Member since',
                children: formatDateTime(detail.createdAt),
              },
              {
                key: 'lastLogin',
                label: 'Last sign-in',
                children: detail.lastLoginAt
                  ? `${formatDateTime(detail.lastLoginAt)} (${formatRelativeTime(detail.lastLoginAt)})`
                  : 'Never',
              },
              { key: 'scans', label: 'Scans run', children: detail.scanCount },
              { key: 'targets', label: 'Targets registered', children: detail.targetCount },
              {
                key: 'firstScan',
                label: 'First scan',
                children: detail.firstScanAt ? formatDateTime(detail.firstScanAt) : '—',
              },
              {
                key: 'lastScan',
                label: 'Last scan',
                children: detail.lastScanAt ? formatRelativeTime(detail.lastScanAt) : 'Never',
              },
            ]}
          />

          <Tabs
            items={[
              {
                key: 'activity',
                label: `Activity (${detail.activity.length})`,
                children: (
                  <EventTimeline events={detail.activity} empty="No recorded activity yet" />
                ),
              },
              {
                key: 'signins',
                label: `Sign-ins (${detail.signIns.length})`,
                children: <EventTimeline events={detail.signIns} empty="No sign-ins recorded yet" />,
              },
            ]}
          />

          {isAdmin ? (
            <Alert
              type="info"
              showIcon
              message="Administrators cannot be blocked"
              description="Remove this person's admin role in GCP IAM first, then block them here."
            />
          ) : (
            <Popconfirm
              title={blocked ? 'Unblock this user?' : 'Block this user?'}
              description={
                blocked
                  ? 'They will be able to sign in and run scans again.'
                  : 'They stay signed out and every API call is rejected until unblocked. Their scans are kept.'
              }
              okText={blocked ? 'Unblock' : 'Block'}
              okButtonProps={{ danger: !blocked }}
              onConfirm={toggleBlocked}
            >
              <Button danger={!blocked} loading={saving} block>
                {blocked ? 'Unblock user' : 'Block user'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      )}
    </Drawer>
  )
}
