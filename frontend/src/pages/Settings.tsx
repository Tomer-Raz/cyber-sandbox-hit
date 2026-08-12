import { Avatar, Card, Descriptions, Flex, Form, Space, Switch, theme, Typography } from 'antd'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/lib/notify'
import { ThemeSegmented } from '@/theme/ThemeToggle'
import { ADMIN_ROLE } from '@/types'

const PREFS: { key: string; label: string; extra: string; default: boolean }[] = [
  {
    key: 'emailAlerts',
    label: 'Email alerts',
    extra: 'Notify me when a scan finds critical or high-severity issues',
    default: true,
  },
]

export default function Settings() {
  const { user } = useAuth()
  const { token } = theme.useToken()

  if (!user) return null

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 800 }}>
      <Card title="Profile">
        <Flex gap={16} align="center" wrap>
          <Avatar size={56} style={{ backgroundColor: token.colorPrimary }}>
            {user.initials}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 16 }}>
              {user.name}
            </Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
              {user.email}
            </Typography.Text>
          </div>
        </Flex>

        <Descriptions
          style={{ marginTop: 20 }}
          size="small"
          bordered
          column={1}
          items={[
            {
              key: 'role',
              label: 'Role',
              children: user.role === ADMIN_ROLE ? 'Admin' : 'User',
            },
          ]}
        />

        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          Profile details are managed by your Google account.
        </Typography.Text>
      </Card>

      <Card title="Appearance">
        <Flex wrap gap={12} align="center" justify="space-between">
          <Typography.Text type="secondary">
            Choose a colour scheme. <Typography.Text code>System</Typography.Text> follows your
            operating system setting.
          </Typography.Text>
          <ThemeSegmented />
        </Flex>
      </Card>

      <Card title="Notifications & automation">
        <Form
          layout="vertical"
          initialValues={Object.fromEntries(PREFS.map((p) => [p.key, p.default]))}
          onValuesChange={() => toast.success('Preference saved')}
        >
          {PREFS.map((p, i) => (
            <Form.Item
              key={p.key}
              name={p.key}
              label={p.label}
              valuePropName="checked"
              extra={p.extra}
              style={i === PREFS.length - 1 ? { marginBottom: 0 } : undefined}
            >
              <Switch />
            </Form.Item>
          ))}
        </Form>
      </Card>
    </Space>
  )
}