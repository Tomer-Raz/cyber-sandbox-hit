/** Fixed atmospheric background: ink base, drifting blueprint grid,
 *  layered radial glows and a faint grain. Sits behind everything. */
export function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      {/* drifting blueprint grid, faded toward the edges */}
      <div
        className="absolute inset-0 bg-blueprint opacity-[0.5] motion-safe:animate-grid-pan"
        style={{
          maskImage: 'radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 75%)',
        }}
      />
      {/* cyan glow, top-left */}
      <div className="absolute -left-40 -top-48 size-[42rem] rounded-full bg-accent/12 blur-[140px]" />
      {/* blue glow, bottom-right */}
      <div className="absolute -bottom-56 -right-40 size-[44rem] rounded-full bg-accent-2/12 blur-[150px]" />
      {/* subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(130% 120% at 50% -10%, transparent 55%, rgb(0 0 0 / 0.55) 100%)',
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  )
}
