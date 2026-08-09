import { theme } from 'antd'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import { useSeverityHex } from '@/theme/palette'
import type { SeverityCounts } from '@/types'

interface Slice {
  key: string
  name: string
  value: number
  color: string
}

export function SeverityDonut({ counts, size = 200 }: { counts: SeverityCounts; size?: number }) {
  const { token } = theme.useToken()
  const severityHex = useSeverityHex()

  const data: Slice[] = SEVERITY_ORDER.map((s) => ({
    key: s,
    name: SEVERITY_META[s].label,
    value: counts[s],
    color: severityHex[s],
  })).filter((d) => d.value > 0)

  const total = data.reduce((a, d) => a + d.value, 0)
  const slices: Slice[] = data.length
    ? data
    : [{ key: 'none', name: 'None', value: 1, color: token.colorFillSecondary }]

  return (
    <div style={{ position: 'relative', height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {slices.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.15 }}>{total}</div>
          <div style={{ fontSize: 12, color: token.colorTextTertiary }}>findings</div>
        </div>
      </div>
    </div>
  )
}
