import { Link } from 'react-router-dom'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Flex, Space, Typography } from 'antd'

export interface BackLink {
  to: string
  label: string
}

export function PageHeader({
  title,
  subtitle,
  extra,
  back,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  extra?: React.ReactNode
  back?: BackLink
}) {
  return (
    <Flex wrap gap={16} align="flex-end" justify="space-between">
      <div style={{ minWidth: 0 }}>
        {back && (
          <Link to={back.to}>
            <ArrowLeftOutlined /> {back.label}
          </Link>
        )}
        <Typography.Title level={4} style={{ margin: back ? '8px 0 4px' : 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={back ? { wordBreak: 'break-all' } : undefined}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </Flex>
  )
}
