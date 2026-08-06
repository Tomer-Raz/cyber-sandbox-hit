// Deterministic pseudo-randomness so mock data is stable across reloads.

/** FNV-1a hash feeding a mulberry32 generator returning [0, 1). */
export function seededRng(key: string): () => number {
  let a = 2166136261
  for (let i = 0; i < key.length; i++) {
    a ^= key.charCodeAt(i)
    a = Math.imul(a, 16777619)
  }
  a >>>= 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Pick `n` unique items from `arr` deterministically. */
export function sample<T>(rng: () => number, arr: T[], n: number): T[] {
  const pool = [...arr]
  const out: T[] = []
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export function intBetween(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
