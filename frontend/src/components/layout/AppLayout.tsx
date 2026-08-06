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
import { ACCENT_HEX, APP_NAME } from '@/lib/constants'
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

// Ordered most-specific first; maps a path to both its menu key and header title.
const ROUTES: { match: (p: string) => boolean; key: string; title: string }[] = [
  { match: (p) => p === '/', key: '/', title: 'Overview' },
  { match: (p) => p.startsWith('/admin/users'), key: '/admin/users', title: 'Users' },
  { match: (p) => p.startsWith('/admin/scans'), key: '/admin/scans', title: 'All Scans' },
  { match: (p) => p === '/scans/new', key: '/scans/new', title: 'New Scan' },
  { match: (p) => p.endsWith('/report'), key: '/scans', title: 'Scan Report' },
  { match: (p) => p === '/scans', key: '/scans', title: 'Scans' },
  { match: (p) => p.startsWith('/scans'), key: '/scans', title: 'Scan Progress' },
  { match: (p) => p.startsWith('/settings'), key: '/settings', title: 'Settings' },
]

function routeFor(pathname: string) {
  return ROUTES.find((r) => r.match(pathname)) ?? { key: pathname, title: APP_NAME }
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
  const route = routeFor(location.pathname)

  const nav = (
    <Menu
      mode="inline"
      selectedKeys={[route.key]}
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
            {route.title}
          </Typography.Title>
          <Dropdown menu={{ items: userMenu }} trigger={['click']}>
            <Button type="text" style={{ height: 48, paddingInline: 8 }}>
              <Space size={8}>
                <Avatar size="small" style={{ backgroundColor: ACCENT_HEX }}>
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
