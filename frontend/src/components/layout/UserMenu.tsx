import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'

export function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (!user) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-line-strong"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-accent-sheen font-display text-xs font-bold text-bg">
          {user.initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[10rem] truncate text-xs font-semibold leading-tight text-ink">
            {user.name}
          </span>
          <span className="block text-[0.66rem] leading-tight text-faint">{user.role}</span>
        </span>
        <Icon name="chevron-down" size={15} className="text-faint" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="panel absolute right-0 mt-2 w-60 overflow-hidden p-1.5 shadow-panel"
          >
            <div className="border-b border-line/70 px-3 py-2.5">
              <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
              <div className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-widest2 text-accent">
                {user.org}
              </div>
            </div>
            <div className="py-1">
              <MenuItem
                icon="settings"
                label="Settings"
                onClick={() => {
                  setOpen(false)
                  navigate('/settings')
                }}
              />
              <MenuItem
                icon="logout"
                label="Sign out"
                danger
                onClick={() => {
                  setOpen(false)
                  logout()
                  toast.info('Signed out', 'Your demo session has ended.')
                  navigate('/login')
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: 'settings' | 'logout'
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ' +
        (danger
          ? 'text-muted hover:bg-critical/10 hover:text-critical'
          : 'text-muted hover:bg-surface-2 hover:text-ink')
      }
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  )
}
