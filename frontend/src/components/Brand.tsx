import { SafetyCertificateFilled } from '@ant-design/icons'
import { theme, Typography } from 'antd'
import { APP_NAME } from '@/lib/constants'

/** Small product mark used in the sider and on the login card. */
export function Brand({ showName = true, size = 22 }: { showName?: boolean; size?: number }) {
  const { token } = theme.useToken()

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <SafetyCertificateFilled style={{ fontSize: size, color: token.colorPrimary }} />
      {showName && (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          {APP_NAME}
        </Typography.Text>
      )}
    </span>
  )
}
