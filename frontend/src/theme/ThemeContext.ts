import { createContext, useContext } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'sbx.theme'

export interface ThemeContextValue {
  /** What the user picked — may be 'system'. */
  mode: ThemeMode
  /** What is actually rendered once 'system' is resolved against the OS. */
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeMode must be used inside <ThemeProvider>')
  return ctx
}
