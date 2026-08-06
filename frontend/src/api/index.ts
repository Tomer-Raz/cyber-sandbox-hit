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
import {
  toAdminScan,
  toAdminUser,
  toApiScanType,
  toDashboardStats,
  toScan,
  toScanEvent,
  toScanReport,
  type ApiAdminScan,
  type ApiAdminUser,
  type ApiDashboard,
  type ApiScan,
  type ApiScanEvent,
  type ApiScanReport,
} from './adapters'

const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'

function delay<T>(value: T, min = 220, max = 520): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), min + Math.random() * (max - min)))
}

// Async so a missing mock scan rejects rather than throwing synchronously.
async function route<T>(
  mock: () => T | undefined,
  live: () => Promise<T>,
  id?: string,
  range?: [number, number],
): Promise<T> {
  if (!USE_MOCKS) return live()
  const value = mock()
  if (value == null) throw new Error(`Scan ${id} not found`)
  return delay(value, ...(range ?? []))
}

export interface StatusPayload {
  scan: Scan
  events: ScanEvent[]
}

// Collection routes keep their trailing slash: without it FastAPI answers a 307
// whose Location the browser refuses to follow from an https:// page.
export const api = {
  getDashboard: (): Promise<DashboardStats> =>
    route(engine.dashboardStats, async () =>
      toDashboardStats((await http.get<ApiDashboard>('/dashboard')).data),
    ),

  listScans: (): Promise<Scan[]> =>
    route(engine.listScans, async () => (await http.get<ApiScan[]>('/scans/')).data.map(toScan)),

  getScan: (id: string): Promise<Scan> =>
    route(() => engine.getScan(id), async () => toScan((await http.get<ApiScan>(`/scans/${id}`)).data), id),

  getScanStatus: (id: string): Promise<StatusPayload> =>
    route(
      () => engine.getStatusPayload(id),
      async () => {
        const { data } = await http.get<{ scan: ApiScan; events: ApiScanEvent[] }>(
          `/scans/${id}/status`,
        )
        return { scan: toScan(data.scan), events: data.events.map(toScanEvent) }
      },
      id,
      [120, 280],
    ),

  getReport: (id: string): Promise<ScanReport> =>
    route(
      () => engine.getReport(id),
      async () => toScanReport((await http.get<ApiScanReport>(`/scans/${id}/report`)).data),
      id,
    ),

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

  cancelScan(id: string): Promise<Scan> {
    return route(
      () => engine.cancelScan(id),
      async () => {
        await http.delete(`/scans/${id}`)
        return this.getScan(id)
      },
      id,
    )
  },

  // The backend 403s these without the admin role; the nav check is convenience.
  listAdminUsers: (): Promise<AdminUser[]> =>
    route(engine.adminUsers, async () =>
      (await http.get<ApiAdminUser[]>('/admin/users')).data.map(toAdminUser),
    ),

  listAdminScans: (): Promise<AdminScan[]> =>
    route(engine.adminScans, async () =>
      (await http.get<ApiAdminScan[]>('/admin/scans')).data.map(toAdminScan),
    ),
}
