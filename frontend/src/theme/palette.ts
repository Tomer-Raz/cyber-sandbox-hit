import { SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import type { Severity } from '@/types'
import { useThemeMode } from './ThemeContext'

/**
 * antd's dark-palette counterparts of the SEVERITY_META hexes. The light hexes
 * are the `-6` step of each preset, which sits too close to a dark surface to
 * read; these are the `-7` step from the same presets, so charts stay in the
 * antd palette while keeping contrast on a dark background.
 */
const DARK_SEVERITY_HEX: Record<Severity, string> = {
  critical: '#e84749', // red-7 dark
  high: '#e87040', // volcano-7 dark
  medium: '#e8b339', // gold-7 dark
  low: '#6abe39', // green-7 dark
  info: '#3c89e8', // blue-7 dark
}

const LIGHT_SEVERITY_HEX = Object.fromEntries(
  SEVERITY_ORDER.map((s) => [s, SEVERITY_META[s].hex]),
) as Record<Severity, string>

/** Severity chart/accent colors resolved against the active theme. */
export function useSeverityHex(): Record<Severity, string> {
  const { resolved } = useThemeMode()
  return resolved === 'dark' ? DARK_SEVERITY_HEX : LIGHT_SEVERITY_HEX
}
