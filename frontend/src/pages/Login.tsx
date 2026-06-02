import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/store/uiStore'
import { APP_TAGLINE } from '@/lib/constants'
import { BrandMark, Logo } from '@/components/ui/Logo'
import { Icon } from '@/components/ui/Icon'

const CONSOLE_LINES = [
  { t: '$ sandbox auth --provider entra-id', c: 'text-muted' },
  { t: '✓ identity verified · scope api://sandbox/scan', c: 'text-low' },
  { t: '$ provision aci --image zap-win:latest', c: 'text-muted' },
  { t: '✓ container online · West Europe', c: 'text-low' },
  { t: '› running active scan · 47 endpoints', c: 'text-accent' },
  { t: '⚠ 3 critical · 5 high correlated to CVEs', c: 'text-medium' },
]

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

export default function Login() {
  const { login, isAuthenticated, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (isAuthenticated) return <Navigate to={from} replace />

  const handleLogin = async () => {
    setSubmitting(true)
    try {
      await login()
      toast.success('Welcome back', 'Signed in to the Sandbox console.')
      navigate(from, { replace: true })
    } catch {
      toast.error('Sign-in failed', 'Could not start a session. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || status === 'loading'

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="panel grid w-full max-w-5xl overflow-hidden shadow-panel lg:grid-cols-2"
      >
        {/* ── Brand / live console ── */}
        <div className="scanlines relative hidden flex-col justify-between overflow-hidden bg-surface-2/40 p-10 lg:flex">
          <div className="absolute -left-24 -top-24 size-72 rounded-full bg-accent/15 blur-[120px]" />
          <div className="absolute inset-0 bg-blueprint opacity-30" />
          <div className="relative">
            <Logo to="" />
            <h1 className="mt-12 font-display text-4xl font-bold leading-[1.05] tracking-tightest text-ink">
              Autonomous
              <br />
              penetration
              <br />
              <span className="text-gradient">testing.</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Orchestrate ephemeral scanners, correlate findings to live CVEs with AI, and validate
              exploits — all from one console.
            </p>
          </div>

          <div className="relative mt-10 rounded-xl border border-line bg-bg/70 p-4 font-mono text-[0.72rem] leading-relaxed">
            {CONSOLE_LINES.map((l, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.28, duration: 0.3 }}
                className={l.c}
              >
                {l.t}
              </motion.div>
            ))}
            <span className="inline-block h-3.5 w-2 translate-y-0.5 bg-accent align-middle motion-safe:animate-blink" />
          </div>
        </div>

        {/* ── Sign in ── */}
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <div className="lg:hidden">
            <Logo to="" />
          </div>
          <div className="mt-8 lg:mt-0">
            <div className="eyebrow">{APP_TAGLINE}</div>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">Sign in to the console</h2>
            <p className="mt-2 text-sm text-muted">
              Authenticate with your organisation account to access scans and reports.
            </p>
          </div>

          <button
            onClick={handleLogin}
            disabled={busy}
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-ink px-4 text-sm font-semibold text-bg transition-all hover:brightness-95 disabled:opacity-60"
          >
            {busy ? (
              <span className="size-5 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />
            ) : (
              <MicrosoftLogo />
            )}
            {busy ? 'Signing in…' : 'Continue with Microsoft'}
          </button>

          <div className="my-6 flex items-center gap-3 text-faint">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[0.62rem] uppercase tracking-widest2">Entra ID · OIDC</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2.5">
            {[
              'Single sign-on via Microsoft Entra ID',
              'Demo mode — no tenant or backend required',
              'Authorized security testing only',
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
                <Icon name="shield-check" size={16} className="shrink-0 text-low" />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 p-3.5">
            <BrandMark size={28} spinning={false} />
            <p className="text-[0.72rem] leading-relaxed text-faint">
              This is an academic demo for HIT. Clicking continue signs you in as a sample analyst
              with simulated scan data.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
