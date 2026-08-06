import { useEffect, useRef, type DependencyList } from 'react'

/**
 * Runs `fn` immediately and then every `ms`. Returning `false` from `fn` stops
 * the interval, which is how terminal states end their own polling.
 */
export function usePolling(
  fn: () => boolean | void | Promise<boolean | void>,
  ms: number,
  deps: DependencyList = [],
) {
  const ref = useRef(fn)
  ref.current = fn

  useEffect(() => {
    let alive = true
    let iv: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      if (iv) clearInterval(iv)
      iv = undefined
    }
    const tick = async () => {
      const keepGoing = await ref.current()
      if (!alive || keepGoing === false) stop()
    }
    void tick()
    iv = setInterval(() => void tick(), ms)
    return () => {
      alive = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}

/** Case-insensitive substring match of `query` against the strings `fields` pulls off each item. */
export function filterBySearch<T>(
  items: T[],
  query: string,
  fields: (item: T) => (string | null | undefined)[],
): T[] {
  const needle = query.trim().toLowerCase()
  // Always a fresh array — callers chain `.sort()` onto the result.
  return items.filter((item) => !needle || fields(item).some((f) => f?.toLowerCase().includes(needle)))
}
