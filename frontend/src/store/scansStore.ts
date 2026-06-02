import { create } from 'zustand'
import type { Scan } from '@/types'
import { api } from '@/api'

interface ScansState {
  scans: Scan[]
  loading: boolean
  loaded: boolean
  error: string | null
  fetchScans: (opts?: { silent?: boolean }) => Promise<void>
  upsert: (scan: Scan) => void
  getById: (id: string) => Scan | undefined
}

export const useScansStore = create<ScansState>((set, get) => ({
  scans: [],
  loading: false,
  loaded: false,
  error: null,

  fetchScans: async (opts) => {
    if (!opts?.silent) set({ loading: true, error: null })
    try {
      const scans = await api.listScans()
      set({ scans, loading: false, loaded: true })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load scans' })
    }
  },

  upsert: (scan) =>
    set((s) => {
      const idx = s.scans.findIndex((x) => x.id === scan.id)
      if (idx === -1) return { scans: [scan, ...s.scans] }
      const next = s.scans.slice()
      next[idx] = scan
      return { scans: next }
    }),

  getById: (id) => get().scans.find((s) => s.id === id),
}))
