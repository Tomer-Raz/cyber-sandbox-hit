import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AuditOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  RadarChartOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Avatar, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Tag, Typography } from 'antd'
import { useAuth } from '@/auth/AuthContext'
import { Brand } from '@/components/Brand'
import { APP_NAME } from '@/lib/constants'
import { ADMIN_ROLE } from '@/types'

const { Header, Sider, Content } = Layout

type NavItems = NonNullable<MenuProps['items']>

const NAV_ITEMS: NavItems = [
  { key: '/', icon: <DashboardOutlined />, label: 'Overview' },
  { key: '/scans', icon: <RadarChartOutlined />, label: 'Scans' },
  { key: '/scans/new', icon: <PlusOutlined />, label: 'New Scan' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
]

// Hidden from everyone else purely to avoid dead links — the backend rejects
// /api/admin for non-admins regardless of what the menu shows.
const ADMIN_NAV_ITEMS: NavItems = [
  { type: 'divider' },
  { key: '/admin/users', icon: <TeamOutlined />, label: 'Users' },
  { key: '/admin/scans', icon: <AuditOutlined />, label: 'All Scans' },
]

function selectedKey(pathname: string): string {
  if (pathname === '/') return '/'
  if (pathname.startsWith('/admin/users')) return '/admin/users'
  if (pathname.startsWith('/admin/scans')) return '/admin/scans'
  if (pathname === '/scans/new') return '/scans/new'
  if (pathname.startsWith('/scans')) return '/scans'
  if (pathname.startsWith('/settings')) return '/settings'
  return pathname
}

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Overview'
  if (pathname === '/scans') return 'Scans'
  if (pathname === '/scans/new') return 'New Scan'
  if (pathname === '/admin/users') return 'Users'
  if (pathname === '/admin/scans') return 'All Scans'
  if (pathname.endsWith('/report')) return 'Scan Report'
  if (pathname.startsWith('/scans/')) return 'Scan Progress'
  if (pathname === '/settings') return 'Settings'
  return APP_NAME
}

const HAIRLINE = '1px solid rgba(5, 5, 5, 0.06)'

export function AppLayout() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleNav: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
    setDrawerOpen(false)
  }

  const isAdmin = user?.role === ADMIN_ROLE

  const nav = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey(location.pathname)]}
      items={isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS}
      onClick={handleNav}
      style={{ borderInlineEnd: 'none' }}
    />
  )

  const userMenu: MenuProps['items'] = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      danger: true,
      onClick: () => {
        logout()
        navigate('/login')
      },
    },
  ]

  return (
    <Layout style={{ minHeight: '100dvh' }}>
      {!isMobile && (
        <Sider
          theme="light"
          width={220}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ borderInlineEnd: HAIRLINE }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              paddingInline: collapsed ? 0 : 16,
            }}
          >
            <Brand showName={!collapsed} />
          </div>
          {nav}
        </Sider>
      )}

      <Layout>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            paddingInline: 16,
            background: '#fff',
            borderBottom: HAIRLINE,
          }}
        >
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            />
          )}
          <Typography.Title level={5} style={{ margin: 0, flex: 1, lineHeight: 1.4 }} ellipsis>
            {routeTitle(location.pathname)}
          </Typography.Title>
          <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Button type="text" style={{ height: 48, paddingInline: 8 }}>
              <Space size={8}>
                <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
                  {user?.initials}
                </Avatar>
                {!isMobile && <span>{user?.name}</span>}
                {isAdmin && !isMobile && (
                  <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                    Admin
                  </Tag>
                )}
              </Space>
            </Button>
          </Dropdown>
        </Header>

        <Content style={{ padding: isMobile ? 16 : 24 }}>
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="left"
        width={240}
        title={<Brand />}
        styles={{ body: { padding: 0 } }}
      >
        {nav}
      </Drawer>
    </Layout>
  )
}
