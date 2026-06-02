import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ACCENT_HEX } from '@/lib/constants'
import type { TrendPoint } from '@/types'

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2 px-3 py-2 shadow-panel">
      <div className="mb-1 font-mono text-[0.62rem] uppercase tracking-widest2 text-faint">{label}</div>
      <div className="flex items-center gap-2 text-xs text-ink">
        <span className="size-2 rounded-full" style={{ background: ACCENT_HEX }} />
        {payload[0].value} findings
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
        <span className="size-2 rounded-full bg-critical" />
        {payload[0].payload.critical} critical · {payload[0].payload.scans} scans
      </div>
    </div>
  )
}

export function TrendArea({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT_HEX} stopOpacity={0.45} />
              <stop offset="100%" stopColor={ACCENT_HEX} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(30 43 69 / 0.6)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} dy={6} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: ACCENT_HEX, strokeOpacity: 0.3 }} />
          <Area
            type="monotone"
            dataKey="findings"
            stroke={ACCENT_HEX}
            strokeWidth={2}
            fill="url(#trend-grad)"
            dot={{ r: 2.5, fill: ACCENT_HEX, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
