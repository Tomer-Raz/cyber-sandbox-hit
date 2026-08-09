import { CheckOutlined, DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Segmented, Tooltip } from 'antd'
import { useThemeMode, type ThemeMode } from './ThemeContext'

const OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <SunOutlined /> },
  { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
  { value: 'system', label: 'System', icon: <DesktopOutlined /> },
]

/** Compact icon button + menu — used in the app header and on the login card. */
export function ThemeToggle() {
  const { mode, resolved, setMode } = useThemeMode()

  const items: MenuProps['items'] = OPTIONS.map((o) => ({
    key: o.value,
    icon: o.icon,
    label: o.label,
    extra: mode === o.value ? <CheckOutlined /> : undefined,
    onClick: () => setMode(o.value),
  }))

  return (
    <Dropdown menu={{ items, selectedKeys: [mode] }} trigger={['click']} placement="bottomRight">
      <Tooltip title="Appearance">
        <Button
          type="text"
          aria-label={`Appearance: ${mode}`}
          icon={resolved === 'dark' ? <MoonOutlined /> : <SunOutlined />}
        />
      </Tooltip>
    </Dropdown>
  )
}

/** Full three-way control for the Settings page. */
export function ThemeSegmented() {
  const { mode, setMode } = useThemeMode()

  return (
    <Segmented<ThemeMode>
      value={mode}
      onChange={setMode}
      options={OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        icon: o.icon,
      }))}
    />
  )
}
