import { Spin } from 'antd'

export function CenteredSpin({ minHeight = '100dvh' }: { minHeight?: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight }}>
      <Spin size="large" />
    </div>
  )
}
