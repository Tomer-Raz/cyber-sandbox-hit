import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircleOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Switch, Typography } from 'antd'
import { api } from '@/api'
import { useScansStore } from '@/store/scansStore'
import { toast } from '@/lib/notify'
import { SCAN_TYPE_META, SCAN_TYPES } from '@/lib/constants'
import type { ScanOptions, ScanType } from '@/types'

interface FormValues extends ScanOptions {
  target: string
  name: string
  scanType: ScanType
  authorized: boolean
}

const DEFAULTS: Record<ScanType, ScanOptions> = {
  baseline: { activeScan: false, ajaxSpider: false, aiCveMatching: true, exploitValidation: false, maxDepth: 3 },
  quick: { activeScan: true, ajaxSpider: false, aiCveMatching: true, exploitValidation: false, maxDepth: 4 },
  api: { activeScan: true, ajaxSpider: false, aiCveMatching: true, exploitValidation: true, maxDepth: 6 },
  full: { activeScan: true, ajaxSpider: true, aiCveMatching: true, exploitValidation: true, maxDepth: 5 },
}

const isValidTarget = (t: string) =>
  /^(https?:\/\/)?([\w-]+\.)+[\w-]+(:\d+)?(\/\S*)?$/i.test(t.trim()) ||
  /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(t.trim())

const OPTION_DEFS: { key: keyof ScanOptions; label: string; description: string }[] = [
  { key: 'activeScan', label: 'Active scan', description: 'Send live injection payloads to the target' },
  { key: 'ajaxSpider', label: 'AJAX spider', description: 'Crawl JavaScript-rendered routes' },
  { key: 'aiCveMatching', label: 'AI CVE matching', description: 'Correlate findings via Vertex AI' },
  {
    key: 'exploitValidation',
    label: 'Exploit validation',
    description: 'Confirm vulnerabilities, cut false positives',
  },
]

export default function NewScan() {
  const [form] = Form.useForm<FormValues>()
  const navigate = useNavigate()
  const upsert = useScansStore((s) => s.upsert)
  const [submitting, setSubmitting] = useState(false)

  const scanType = Form.useWatch('scanType', form) ?? 'full'
  const meta = SCAN_TYPE_META[scanType]

  const initialValues: FormValues = {
    target: '',
    name: '',
    scanType: 'full',
    authorized: false,
    ...DEFAULTS.full,
  }

  const onFinish = async ({ name, target, scanType: type, authorized, ...options }: FormValues) => {
    setSubmitting(true)
    try {
      const scan = await api.createScan({
        name: name?.trim() ?? '',
        target: target.trim(),
        scanType: type,
        options,
        authorized,
      })
      upsert(scan)
      toast.success('Scan queued', `${meta.label} scan launched against ${scan.target}`)
      navigate(`/scans/${scan.id}`)
    } catch (err) {
      toast.error('Could not start scan', err instanceof Error ? err.message : undefined)
      setSubmitting(false)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onFinish}
      requiredMark="optional"
      style={{ maxWidth: 760 }}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="Target">
          <Form.Item
            name="target"
            label="URL, domain, or IP address"
            extra="The system or application you are authorized to test. A bare domain is resolved to whichever address actually answers."
            rules={[
              { required: true, message: 'A target URL or IP is required' },
              {
                validator: (_, value: string) =>
                  !value || isValidTarget(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('Enter a valid URL, domain, or IP address')),
              },
            ]}
          >
            <Input placeholder="https://staging.acme-demo.com" autoFocus spellCheck={false} />
          </Form.Item>

          <Form.Item name="name" label="Scan name" extra="Optional — a friendly label for this run.">
            <Input placeholder="e.g. Production storefront — full sweep" />
          </Form.Item>
        </Card>

        <Card title="Scan profile">
          <Form.Item name="scanType" label="Profile">
            <Select
              onChange={(type: ScanType) => form.setFieldsValue(DEFAULTS[type])}
              options={SCAN_TYPES.map((t) => ({
                value: t,
                label: `${SCAN_TYPE_META[t].label} · ${SCAN_TYPE_META[t].tagline}`,
              }))}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {meta.description}
            <br />
            Policy <Typography.Text code>{meta.policy}</Typography.Text> · estimated{' '}
            {meta.estMinutes}
          </Typography.Paragraph>
        </Card>

        <Card title="Engine options">
          <Row gutter={[16, 0]}>
            {OPTION_DEFS.map((o) => (
              <Col xs={24} sm={12} key={o.key}>
                <Form.Item
                  name={o.key}
                  label={o.label}
                  valuePropName="checked"
                  extra={o.description}
                >
                  <Switch />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Form.Item name="maxDepth" label="Crawl depth" style={{ maxWidth: 200 }}>
            <Select
              options={Array.from({ length: 10 }, (_, i) => ({
                value: i + 1,
                label: `${i + 1} ${i === 0 ? 'level' : 'levels'}`,
              }))}
            />
          </Form.Item>
        </Card>

        <Card>
          <Form.Item
            name="authorized"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value: boolean) =>
                  value
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error('You must confirm authorization to scan this target'),
                      ),
              },
            ]}
          >
            <Checkbox>
              I confirm I am <strong>authorized</strong> to perform security testing against this
              target.
            </Checkbox>
          </Form.Item>

          <Button
            type="primary"
            size="large"
            htmlType="submit"
            loading={submitting}
            icon={<PlayCircleOutlined />}
            block
          >
            Launch scan
          </Button>
          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 0 }}
          >
            An ephemeral container is provisioned for the scan and destroyed on completion.
          </Typography.Paragraph>
        </Card>
      </Space>
    </Form>
  )
}
