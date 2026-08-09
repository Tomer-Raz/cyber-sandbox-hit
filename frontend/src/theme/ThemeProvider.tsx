import { useCallback, useEffect, useMemo, useState } from 'react'
import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { ACCENT_HEX } from '@/lib/constants'
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeMode,
} from './ThemeContext'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStoredMode(): ThemeMode {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

/**
 * Keeps the browser chrome in step with the antd theme: `color-scheme` drives
 * native scrollbars/form controls, and the meta tag drives the mobile URL bar.
 */
function ThemeSideEffects({ resolved }: { resolved: ResolvedTheme }) {
  const { token } = theme.useToken()

  useEffect(() => {
    const root = document.documentElement
    root.style.colorScheme = resolved
    root.dataset.theme = resolved
    root.style.backgroundColor = token.colorBgLayout
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', token.colorBgLayout)
  }, [resolved, token.colorBgLayout])

  return null
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem(THEME_STORAGE_KEY, next)
  }, [])

  const resolved: ResolvedTheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])

  const themeConfig = useMemo(() => {
    const base = {
      algorithm: resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: { colorPrimary: ACCENT_HEX, borderRadius: 6 },
    }
    // Layout's dark `siderBg`/`headerBg`/`triggerBg` are legacy v4 navy
    // (#001529) rather than algorithm-derived, so a dark Sider would clash with
    // every other dark surface. Pin them to the real container background.
    const t = theme.getDesignToken(base)
    return {
      ...base,
      components: {
        Layout: {
          siderBg: t.colorBgContainer,
          headerBg: t.colorBgContainer,
          triggerBg: t.colorBgContainer,
          triggerColor: t.colorText,
        },
      },
    }
  }, [resolved])

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig}>
        <ThemeSideEffects resolved={resolved} />
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
