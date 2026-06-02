import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { ACCENT_HEX, ACCENT2_HEX } from '@/lib/constants'
import type { CategoryCount } from '@/types'

export function FindingsByCategoryBar({ data }: { data: CategoryCount[] }) {
  const rows = [...data].sort((a, b) => b.count - a.count).slice(0, 8)
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div style={{ height: Math.max(160, rows.length * 38) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 2, right: 28, bottom: 2, left: 8 }}
          barCategoryGap={9}
        >
          <defs>
            <linearGradient id="cat-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ACCENT_HEX} />
              <stop offset="100%" stopColor={ACCENT2_HEX} />
            </linearGradient>
          </defs>
          <XAxis type="number" domain={[0, max]} hide />
          <YAxis
            type="category"
            dataKey="category"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'rgb(147 161 189)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 4, 4]} fill="url(#cat-grad)" maxBarSize={16}>
            {rows.map((_, i) => (
              <Cell key={i} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              className="nums"
              fill="rgb(231 238 248)"
              fontSize={11}
              fontFamily="JetBrains Mono"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
