import type { IconName } from '@/components/ui/Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/scans', label: 'Scans', icon: 'radar' },
  { to: '/scans/new', label: 'New Scan', icon: 'plus' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

/** Human title + breadcrumb for the top bar, derived from the pathname. */
export function routeMeta(pathname: string): { title: string; crumb: string } {
  if (pathname === '/') return { title: 'Mission Control', crumb: 'Overview' }
  if (pathname === '/scans') return { title: 'Scans', crumb: 'Scans' }
  if (pathname === '/scans/new') return { title: 'Configure New Scan', crumb: 'Scans / New' }
  if (pathname.endsWith('/report')) return { title: 'Scan Report', crumb: 'Scans / Report' }
  if (pathname.startsWith('/scans/')) return { title: 'Scan Progress', crumb: 'Scans / Live' }
  if (pathname === '/settings') return { title: 'Settings', crumb: 'Settings' }
  return { title: 'Sandbox Playground', crumb: '' }
}
