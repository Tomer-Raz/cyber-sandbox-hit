import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/uiStore'
import { useAuth } from '@/auth/AuthContext'
import { Icon } from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'
import { NAV_ITEMS, type NavItem } from './nav'

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/'
  if (item.to === '/scans')
    return pathname === '/scans' || (pathname.startsWith('/scans/') && pathname !== '/scans/new')
  return pathname === item.to
}

function NavRow({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const active = isActive(item, pathname)
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
        active ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--c-accent)/0.8)]"
        />
      )}
      <Icon
        name={item.icon}
        size={18}
        className={cn('transition-colors', active ? 'text-accent' : 'text-faint group-hover:text-muted')}
      />
      <span className="font-medium">{item.label}</span>
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="px-2 py-3">
        <Logo />
      </div>

      <button
        onClick={() => {
          navigate('/scans/new')
          onNavigate?.()
        }}
        className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-accent-sheen px-4 py-2.5 text-sm font-semibold text-bg shadow-glow-sm transition-all hover:brightness-110"
      >
        <Icon name="plus" size={17} />
        New Scan
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="eyebrow px-3 pb-1 pt-2">Navigate</div>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.to} item={item} pathname={pathname} onClick={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3">
          <div className="flex items-center gap-2 text-low">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-low/70" />
              <span className="relative inline-flex size-2 rounded-full bg-low" />
            </span>
            <span className="font-mono text-[0.66rem] uppercase tracking-widest2">Demo · Mock API</span>
          </div>
          <p className="mt-1.5 text-[0.7rem] leading-relaxed text-faint">
            Running on simulated data — no live backend or Entra tenant required.
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-sheen font-display text-xs font-bold text-bg">
              {user.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-ink">{user.name}</div>
              <div className="truncate text-[0.66rem] text-faint">{user.role}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const open = useUiStore((s) => s.sidebarOpen)
  const setOpen = useUiStore((s) => s.setSidebarOpen)

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-surface/60 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <SidebarContent onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
