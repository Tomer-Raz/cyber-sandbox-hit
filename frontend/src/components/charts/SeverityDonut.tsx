import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import type { SeverityCounts } from '@/types'

export function SeverityDonut({ counts, size = 200 }: { counts: SeverityCounts; size?: number }) {
  const data = SEVERITY_ORDER.map((s) => ({
    key: s,
    name: SEVERITY_META[s].label,
    value: counts[s],
    color: SEVERITY_META[s].hex,
  })).filter((d) => d.value > 0)

  const total = data.reduce((a, d) => a + d.value, 0)

  return (
    <div className="relative" style={{ height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ key: 'none', name: 'None', value: 1, color: '#1E2B45' }]}
            dataKey="value"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 3 : 0}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {(data.length ? data : [{ color: '#1E2B45' }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="nums font-display text-3xl font-bold text-ink">{total}</div>
          <div className="font-mono text-[0.6rem] uppercase tracking-widest2 text-faint">
            findings
          </div>
        </div>
      </div>
    </div>
  )
}
