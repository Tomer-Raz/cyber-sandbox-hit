import { theme } from 'antd'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '@/types'

interface TrendTooltipProps {
  active?: boolean
  label?: string | number
  payload?: Array<{ value?: number; payload?: TrendPoint }>
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  const { token } = theme.useToken()
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div
      style={{
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        padding: '8px 10px',
        boxShadow: token.boxShadowSecondary,
        color: token.colorText,
        fontSize: 12,
      }}
    >
      <div style={{ color: token.colorTextTertiary, marginBottom: 4 }}>{label}</div>
      <div>{payload[0]?.value ?? 0} findings</div>
      {point && (
        <div style={{ color: token.colorTextTertiary }}>
          {point.critical} critical · {point.scans} scans
        </div>
      )}
    </div>
  )
}

export function TrendArea({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  const { token } = theme.useToken()

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={token.colorSplit} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: token.colorTextTertiary }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: token.colorTextTertiary }}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            content={<TrendTooltip />}
            cursor={{ stroke: token.colorPrimary, strokeOpacity: 0.25 }}
          />
          <Area
            type="monotone"
            dataKey="findings"
            stroke={token.colorPrimary}
            strokeWidth={2}
            fill={token.colorPrimary}
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
