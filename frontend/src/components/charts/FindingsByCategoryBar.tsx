import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ACCENT_HEX, TEXT } from '@/lib/constants'
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
          margin={{ top: 2, right: 30, bottom: 2, left: 4 }}
          barCategoryGap={9}
        >
          <XAxis type="number" domain={[0, max]} hide />
          <YAxis
            type="category"
            dataKey="category"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: TEXT }}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 4, 4]}
            fill={ACCENT_HEX}
            maxBarSize={16}
            isAnimationActive={false}
          >
            <LabelList dataKey="count" position="right" fill={TEXT} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
