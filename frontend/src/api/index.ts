import type {
  AdminScan,
  AdminUser,
  DashboardStats,
  Scan,
  ScanEvent,
  ScanReport,
  ScanRequest,
} from '@/types'
import { http } from './client'
import * as engine from './mock/engine'
import type {
  ApiAdminScan,
  ApiAdminUser,
  ApiDashboard,
  ApiScan,
  ApiScanReport,
  ApiScanEvent,
} from './adapters'
import {
  toAdminScan,
  toAdminUser,
  toApiScanType,
  toDashboardStats,
  toScan,
  toScanEvent,
  toScanReport,
} from './adapters'

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
// Collection routes keep their trailing slash: without it FastAPI answers a
// 307 whose Location the browser refuses to follow from an https:// page.
export const api = {
  async getDashboard(): Promise<DashboardStats> {
    if (USE_MOCKS) return delay(engine.dashboardStats())
    const { data } = await http.get<ApiDashboard>('/dashboard')
    return toDashboardStats(data)
  },

  async listScans(): Promise<Scan[]> {
    if (USE_MOCKS) return delay(engine.listScans())
    const { data } = await http.get<ApiScan[]>('/scans/')
    return data.map(toScan)
  },

  async getScan(id: string): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.getScan(id) ?? notFound(id))
    const { data } = await http.get<ApiScan>(`/scans/${id}`)
    return toScan(data)
  },

  async getScanStatus(id: string): Promise<StatusPayload> {
    if (USE_MOCKS) return delay(engine.getStatusPayload(id) ?? notFound(id), 120, 280)
    const { data } = await http.get<{ scan: ApiScan; events: ApiScanEvent[] }>(
      `/scans/${id}/status`,
    )
    return { scan: toScan(data.scan), events: data.events.map(toScanEvent) }
  },

  async getReport(id: string): Promise<ScanReport> {
    if (USE_MOCKS) return delay(engine.getReport(id) ?? notFound(id))
    const { data } = await http.get<ApiScanReport>(`/scans/${id}/report`)
    return toScanReport(data)
  },

  async createScan(req: ScanRequest): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.createScan(req), 500, 900)

    // The backend scans a registered Target, not a raw URL, so the target is
    // created (and SSRF-checked) first. Re-posting a known URL is harmless.
    const { data: target } = await http.post<{ id: string }>('/targets/', {
      url: req.target,
      description: req.name,
    })
    const { data } = await http.post<ApiScan>('/scans/', {
      target_id: target.id,
      scan_type: toApiScanType(req.scanType),
      options: req.options,
    })
    return toScan(data)
  },

  async cancelScan(id: string): Promise<Scan> {
    if (USE_MOCKS) return delay(engine.cancelScan(id) ?? notFound(id))
    await http.delete(`/scans/${id}`)
    return this.getScan(id)
  },

  // ── Admin ───────────────────────────────────────────────
  // Read-only. The backend rejects these with 403 for anyone who does not hold
  // the admin role in GCP IAM, so the nav-level check in the SPA is
  // convenience, not the actual gate.

  async listAdminUsers(): Promise<AdminUser[]> {
    if (USE_MOCKS) return delay(engine.adminUsers())
    const { data } = await http.get<ApiAdminUser[]>('/admin/users')
    return data.map(toAdminUser)
  },

  async listAdminScans(): Promise<AdminScan[]> {
    if (USE_MOCKS) return delay(engine.adminScans())
    const { data } = await http.get<ApiAdminScan[]>('/admin/scans')
    return data.map(toAdminScan)
  },
}

export type Api = typeof api
