import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CopyOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Popconfirm,
  Space,
  Switch,
  Typography,
} from 'antd'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/lib/notify'

interface Prefs {
  emailAlerts: boolean
  autoValidate: boolean
  weeklyDigest: boolean
}

function genApiKey(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `sbx_live_${hex}`
}

export default function Settings() {
  const { user, logout, mode } = useAuth()
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState(genApiKey)

  const initialPrefs: Prefs = { emailAlerts: true, autoValidate: true, weeklyDigest: false }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      toast.success('API key copied to clipboard')
    } catch {
      toast.error('Copy failed')
    }
  }

  const regenerate = () => {
    setApiKey(genApiKey())
    toast.warning('API key regenerated', 'The previous key has been revoked.')
  }

  if (!user) return null

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 800 }}>
      <Card title="Profile">
        <Flex gap={16} align="center" wrap>
          <Avatar size={56} style={{ backgroundColor: '#1677ff' }}>
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
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: 'role', label: 'Role', children: user.role },
            { key: 'org', label: 'Organisation', children: user.org },
          ]}
        />

        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
          Profile details are managed by your Google account.
        </Typography.Text>
      </Card>

      <Card title="Notifications & automation">
        <Form
          layout="vertical"
          initialValues={initialPrefs}
          onValuesChange={() => toast.success('Preference saved')}
        >
          <Form.Item
            name="emailAlerts"
            label="Email alerts"
            valuePropName="checked"
            extra="Notify me when a scan finds critical or high-severity issues"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="autoValidate"
            label="Auto-run exploit validation"
            valuePropName="checked"
            extra="Validate high-risk findings automatically after each scan"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="weeklyDigest"
            label="Weekly digest"
            valuePropName="checked"
            extra="A Monday summary of scan activity and open risks"
            style={{ marginBottom: 0 }}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Card>

      <Card title="API access">
        <Typography.Paragraph type="secondary">
          Use this key to trigger scans from CI pipelines or scripts against the FastAPI backend.
        </Typography.Paragraph>
        <Input.Password readOnly value={apiKey} className="mono" />
        <Space wrap style={{ marginTop: 12 }}>
          <Button icon={<CopyOutlined />} onClick={copyKey}>
            Copy
          </Button>
          <Button icon={<ReloadOutlined />} onClick={regenerate}>
            Rotate
          </Button>
        </Space>
      </Card>

      <Card title="Session">
        <Flex wrap gap={12} align="center" justify="space-between">
          <Typography.Text type="secondary">
            Signed in via <Typography.Text code>{mode === 'google' ? 'Google' : 'demo (mock)'}</Typography.Text>
          </Typography.Text>
          <Space wrap>
            <Popconfirm
              title="Reset demo data?"
              description="Clears local session and simulated scans."
              onConfirm={() => {
                localStorage.clear()
                window.location.reload()
              }}
            >
              <Button icon={<ReloadOutlined />}>Reset demo data</Button>
            </Popconfirm>
            <Button
              danger
              icon={<LogoutOutlined />}
              onClick={() => {
                logout()
                toast.info('Signed out')
                navigate('/login')
              }}
            >
              Sign out
            </Button>
          </Space>
        </Flex>
      </Card>
    </Space>
  )
}
