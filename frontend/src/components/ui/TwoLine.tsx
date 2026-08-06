import { MUTED } from '@/lib/constants'

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
  return (
    <div style={{ minWidth: 0 }}>
      <div>{primary}</div>
      <div style={{ fontSize: 12, color: MUTED, wordBreak: breakAll ? 'break-all' : undefined }}>
        {secondary}
      </div>
    </div>
  )
}
