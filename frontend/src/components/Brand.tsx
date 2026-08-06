import { SafetyCertificateFilled } from '@ant-design/icons'
import { Typography } from 'antd'
import { ACCENT_HEX, APP_NAME } from '@/lib/constants'

/** Small product mark used in the sider and on the login card. */
export function Brand({ showName = true, size = 22 }: { showName?: boolean; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <SafetyCertificateFilled style={{ fontSize: size, color: ACCENT_HEX }} />
      {showName && (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          {APP_NAME}
        </Typography.Text>
      )}
    </span>
  )
}
