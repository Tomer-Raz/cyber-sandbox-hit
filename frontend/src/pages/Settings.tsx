import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Switch } from '@/components/ui/Field'

function genApiKey(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `sbx_live_${hex}`
}

export default function Settings() {
  const { user, logout, mode } = useAuth()
  const navigate = useNavigate()

  const [prefs, setPrefs] = useState({ emailAlerts: true, autoValidate: true, weeklyDigest: false })
  const [apiKey, setApiKey] = useState(genApiKey)
  const [revealed, setRevealed] = useState(false)

  const setPref = (key: keyof typeof prefs, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }))
    toast.success('Preference saved')
  }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      toast.success('Copied', 'API key copied to clipboard.')
    } catch {
      toast.error('Copy failed')
    }
  }

  const regenerate = () => {
    setApiKey(genApiKey())
    setRevealed(true)
    toast.warning('API key regenerated', 'The previous key has been revoked.')
  }

  const masked = `${apiKey.slice(0, 12)}${'•'.repeat(20)}`

  if (!user) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Profile */}
      <Card title="Profile" eyebrow="Account" icon="user">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-2xl bg-accent-sheen font-display text-xl font-bold text-bg">
            {user.initials}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-ink">{user.name}</div>
            <div className="truncate text-sm text-muted">{user.email}</div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ReadField label="Role" value={user.role} />
          <ReadField label="Organisation" value={user.org} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
          <Icon name="lock" size={13} /> Profile details are managed by Microsoft Entra ID.
        </p>
      </Card>

      {/* Preferences */}
      <Card title="Notifications & automation" eyebrow="Preferences" icon="sliders">
        <div className="space-y-3">
          <Switch
            checked={prefs.emailAlerts}
            onChange={(v) => setPref('emailAlerts', v)}
            label="Email alerts"
            description="Notify me when a scan finds critical or high-severity issues"
            icon={<Icon name="bell" size={17} />}
          />
          <Switch
            checked={prefs.autoValidate}
            onChange={(v) => setPref('autoValidate', v)}
            label="Auto-run exploit validation"
            description="Validate high-risk findings automatically after each scan"
            icon={<Icon name="flask" size={17} />}
          />
          <Switch
            checked={prefs.weeklyDigest}
            onChange={(v) => setPref('weeklyDigest', v)}
            label="Weekly digest"
            description="A Monday summary of scan activity and open risks"
            icon={<Icon name="activity" size={17} />}
          />
        </div>
      </Card>

      {/* API access */}
      <Card title="API access" eyebrow="Integrations" icon="key">
        <p className="text-sm text-muted">
          Use this key to trigger scans from CI pipelines or scripts against the FastAPI backend.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-xl border border-line bg-bg/60 px-3 py-2.5 font-mono text-xs text-ink">
            {revealed ? apiKey : masked}
          </code>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" iconLeft="eye" onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
            <Button variant="secondary" size="sm" iconLeft="copy" onClick={copyKey}>
              Copy
            </Button>
            <Button variant="secondary" size="sm" iconLeft="refresh" onClick={regenerate}>
              Rotate
            </Button>
          </div>
        </div>
      </Card>

      {/* Session */}
      <Card title="Session" eyebrow="Security" icon="shield">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted">
            Signed in via{' '}
            <span className="font-mono text-xs text-ink">{mode === 'msal' ? 'Entra ID' : 'demo (mock)'}</span>{' '}
            session.
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft="refresh"
              onClick={() => {
                localStorage.clear()
                window.location.reload()
              }}
            >
              Reset demo data
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconLeft="logout"
              onClick={() => {
                logout()
                toast.info('Signed out')
                navigate('/login')
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  )
}
