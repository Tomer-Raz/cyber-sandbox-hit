import type { DashboardStats, Scan, ScanEvent, ScanReport, ScanRequest } from '@/types'
import { http } from './client'
import * as engine from './mock/engine'

const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'

// Simulated network latency so the mock feels like a real backend.
function delay<T>(value: T, min = 220, max = 520): Promise<T> {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function notFound(id: string): never {
  throw new Error(`Scan ${id} not found`)
}

export interface StatusPayload {
  scan: Scan
  events: ScanEvent[]
}

// ── Public API ────────────────────────────────────────────
// Each call branches: mock engine (default) or live FastAPI backend.
export const api = {
  async getDashboard(): Promise<DashboardStats> {
    if (USE_MOCKS) return delay(engine.dashboardStats())
    const { data } = await http.get<DashboardStats>('/dashboard')
    return data
  },

  async listScans(): Promise<Scan[]> {
    if (USE_MOCKS) return delay(engine.listScans())
    const { data } = await http.get<Scan[]>('/scans')
    return data
  },

  async getScan(id: string): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.getScan(id) ?? notFound(id))
    const { data } = await http.get<Scan>(`/scans/${id}`)
    return data
  },

  async getScanStatus(id: string): Promise<StatusPayload> {
    if (USE_MOCKS) return delay(engine.getStatusPayload(id) ?? notFound(id), 120, 280)
    const { data } = await http.get<StatusPayload>(`/scans/${id}/status`)
    return data
  },

  async getReport(id: string): Promise<ScanReport> {
    if (USE_MOCKS) return delay(engine.getReport(id) ?? notFound(id))
    const { data } = await http.get<ScanReport>(`/scans/${id}/report`)
    return data
  },

  async createScan(req: ScanRequest): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.createScan(req), 500, 900)
    const { data } = await http.post<Scan>('/scans', req)
    return data
  },

  async cancelScan(id: string): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.cancelScan(id) ?? notFound(id))
    const { data } = await http.post<Scan>(`/scans/${id}/cancel`)
    return data
  },
}

export type Api = typeof api
