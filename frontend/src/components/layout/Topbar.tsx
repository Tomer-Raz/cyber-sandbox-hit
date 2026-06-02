import { useLocation } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { routeMeta } from './nav'
import { UserMenu } from './UserMenu'

export function Topbar() {
  const { pathname } = useLocation()
  const toggle = useUiStore((s) => s.toggleSidebar)
  const meta = routeMeta(pathname)

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          onClick={toggle}
          className="grid size-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Icon name="menu" size={18} />
        </button>

        <div className="min-w-0">
          {meta.crumb && (
            <div className="hidden font-mono text-[0.62rem] uppercase tracking-widest2 text-faint sm:block">
              {meta.crumb}
            </div>
          )}
          <h1 className="truncate font-display text-lg font-semibold leading-tight text-ink">
            {meta.title}
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-surface-2/50 px-3 py-1.5 md:flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-low/70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-low" />
            </span>
            <span className="font-mono text-[0.64rem] uppercase tracking-widest2 text-muted">
              Sandbox online
            </span>
          </div>

          <Button to="/scans/new" iconLeft="plus" size="sm" className="hidden sm:inline-flex">
            New Scan
          </Button>

          <button
            className="relative grid size-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
            aria-label="Notifications"
          >
            <Icon name="bell" size={17} />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />
          </button>

          <UserMenu />
        </div>
      </div>
    </header>
  )
}
