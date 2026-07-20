import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/store/uiStore'
import { APP_TAGLINE } from '@/lib/constants'
import { BrandMark, Logo } from '@/components/ui/Logo'
import { Icon } from '@/components/ui/Icon'

const CONSOLE_LINES = [
  { t: '$ sandbox auth --provider google', c: 'text-muted' },
  { t: '✓ identity verified · scope api://sandbox/scan', c: 'text-low' },
  { t: '$ provision cloud-run-job --image zap:latest', c: 'text-muted' },
  { t: '✓ job running · europe-west1', c: 'text-low' },
  { t: '› running active scan · 47 endpoints', c: 'text-accent' },
  { t: '⚠ 3 critical · 5 high correlated to CVEs', c: 'text-medium' },
]

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
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
              <GoogleLogo />
            )}
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>

          <div className="my-6 flex items-center gap-3 text-faint">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[0.62rem] uppercase tracking-widest2">Google · OIDC</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2.5">
            {[
              'Sign in with your Google account',
              'Demo mode — no OAuth client or backend required',
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
