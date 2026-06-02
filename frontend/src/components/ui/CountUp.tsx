import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  duration?: number
  decimals?: number
  className?: string
  suffix?: string
}

/** Animates a number from 0 → value with an ease-out curve on mount. */
export function CountUp({ value, duration = 900, decimals = 0, className, suffix }: CountUpProps) {
  const [n, setN] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0
    startRef.current = null
    const tick = (t: number) => {
      if (startRef.current == null) startRef.current = t
      const p = Math.min(1, (t - startRef.current) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setN(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <span className={className}>
      {n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}
