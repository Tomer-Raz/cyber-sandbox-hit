import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ACCENT_HEX } from '@/lib/constants'
import type { TrendPoint } from '@/types'

interface TrendTooltipProps {
  active?: boolean
  label?: string | number
  payload?: Array<{ value?: number; payload?: TrendPoint }>
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'rgba(0, 0, 0, 0.45)', marginBottom: 4 }}>{label}</div>
      <div>{payload[0]?.value ?? 0} findings</div>
      {point && (
        <div style={{ color: 'rgba(0, 0, 0, 0.45)' }}>
          {point.critical} critical · {point.scans} scans
        </div>
      )}
    </div>
  )
}

export function TrendArea({ data, height = 200 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'rgba(0, 0, 0, 0.45)' }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'rgba(0, 0, 0, 0.45)' }}
            width={40}
            allowDecimals={false}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: ACCENT_HEX, strokeOpacity: 0.25 }} />
          <Area
            type="monotone"
            dataKey="findings"
            stroke={ACCENT_HEX}
            strokeWidth={2}
            fill={ACCENT_HEX}
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
