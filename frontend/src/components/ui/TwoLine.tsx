import { theme } from 'antd'

/** Table cell: primary value over a smaller muted line. */
export function TwoLine({
  primary,
  secondary,
  breakAll = true,
}: {
  primary: React.ReactNode
  secondary: React.ReactNode
  breakAll?: boolean
}) {
  const { token } = theme.useToken()

  return (
    <div style={{ minWidth: 0 }}>
      <div>{primary}</div>
      <div
        style={{
          fontSize: 12,
          color: token.colorTextTertiary,
          wordBreak: breakAll ? 'break-all' : undefined,
        }}
      >
        {secondary}
      </div>
    </div>
  )
}
