import { SEVERITY_META, SEVERITY_ORDER, TEXT } from '@/lib/constants'
import type { SeverityCounts } from '@/types'

/** Flat stacked bar showing the severity distribution of a finding set. */
export function SeverityBar({
  counts,
  showLegend = false,
}: {
  counts: SeverityCounts
  showLegend?: boolean
}) {
  const total = SEVERITY_ORDER.reduce((a, s) => a + counts[s], 0)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: '#f0f0f0',
        }}
      >
        {total > 0 &&
          SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <div
              key={s}
              title={`${SEVERITY_META[s].label}: ${counts[s]}`}
              style={{
                width: `${(counts[s] / total) * 100}%`,
                background: SEVERITY_META[s].hex,
              }}
            />
          ))}
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
          {SEVERITY_ORDER.map((s) => (
            <span
              key={s}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: TEXT,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: SEVERITY_META[s].hex,
                }}
              />
              {SEVERITY_META[s].label} <strong>{counts[s]}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
