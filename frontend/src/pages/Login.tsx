import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { GoogleOutlined } from '@ant-design/icons'
import { GoogleLogin } from '@react-oauth/google'
import { Button, Card, Flex, Space, Spin, theme, Typography } from 'antd'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/lib/notify'
import { Brand } from '@/components/Brand'
import { CenteredSpin } from '@/components/ui/CenteredSpin'
import { APP_TAGLINE } from '@/lib/constants'
import { ThemeToggle } from '@/theme/ThemeToggle'

export default function Login() {
  const { login, loginWithCredential, loginAsGuest, isAuthenticated, status, mode } = useAuth()
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // Refreshing on /login with a stored session would otherwise flash the
  // sign-in card before the redirect lands.
  if (status === 'restoring') return <CenteredSpin />
  if (isAuthenticated) return <Navigate to={from} replace />

  const signIn = async (attempt: () => Promise<void>, failure: string) => {
    setSubmitting(true)
    try {
      await attempt()
      toast.success('Signed in to the Sandbox console')
      navigate(from, { replace: true })
    } catch (err) {
      // Prefer what actually failed. A fixed string here reads as a diagnosis,
      // and "guest access is not enabled" for what was really an unreachable
      // backend sends you looking in entirely the wrong place.
      toast.error('Sign-in failed', err instanceof Error ? err.message : failure)
    } finally {
      setSubmitting(false)
    }
  }

  // Google hands back an ID token (JWT) from its own rendered button; the
  // backend verifies it. Nothing is trusted from the client side here.
  const handleGoogleCredential = (credential?: string) => {
    if (!credential || !loginWithCredential) {
      toast.error('Sign-in failed', 'Google did not return a credential.')
      return
    }
    void signIn(
      () => loginWithCredential(credential),
      'The backend rejected this credential. Try again.',
    )
  }

  // Temporary guest access for the project review — no credential to enter;
  // the backend refuses it unless GUEST_MODE_ENABLED is on.
  const signInAsGuest = (guestMode: 'user' | 'admin') => {
    if (!loginAsGuest) return
    void signIn(() => loginAsGuest(guestMode), 'Could not start a guest session.')
  }

  const busy = submitting || status === 'loading'

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        position: 'relative',
        minHeight: '100dvh',
        padding: 16,
        background: token.colorBgLayout,
      }}
    >
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16 }}>
        <ThemeToggle />
      </div>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Brand size={30} />
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              {APP_TAGLINE}
            </Typography.Paragraph>
          </div>

          <div>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
              Sign in
            </Typography.Title>
            <Typography.Text type="secondary">
              Authenticate with your Google account to access scans and reports.
            </Typography.Text>
          </div>

          {mode === 'google' ? (
            <Flex justify="center">
              {/* Google renders its button in an iframe we cannot put a spinner
                  inside, so the loader covers it while /auth/me is in flight. */}
              <div style={{ position: 'relative', minHeight: 40, width: 320 }}>
                <div
                  style={{
                    visibility: busy ? 'hidden' : 'visible',
                    pointerEvents: busy ? 'none' : 'auto',
                  }}
                >
                  <GoogleLogin
                    onSuccess={(res) => handleGoogleCredential(res.credential)}
                    onError={() =>
                      toast.error('Sign-in failed', 'Google rejected the sign-in attempt.')
                    }
                    useOneTap
                    shape="rectangular"
                    size="large"
                    text="continue_with"
                    width="320"
                  />
                </div>
                {busy && (
                  <Flex
                    align="center"
                    justify="center"
                    gap={10}
                    style={{ position: 'absolute', inset: 0 }}
                  >
                    <Spin size="small" />
                    <Typography.Text type="secondary">Verifying your account…</Typography.Text>
                  </Flex>
                )}
              </div>
            </Flex>
          ) : (
            <Button
              type="primary"
              size="large"
              block
              icon={<GoogleOutlined />}
              loading={busy}
              onClick={() => void signIn(login, 'Could not start a session. Try again.')}
            >
              Continue with Google
            </Button>
          )}

          {mode === 'google' && (
            <Card size="small" title="Temporary">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Guest access for the project review — pick a role to sign in. No Google account
                  required.
                </Typography.Text>
                <Button block disabled={busy} onClick={() => signInAsGuest('user')}>
                  Sign in as Guest — User role
                </Button>
                <Button block disabled={busy} onClick={() => signInAsGuest('admin')}>
                  Sign in as Guest — Admin role
                </Button>
              </Space>
            </Card>
          )}

          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', textAlign: 'center' }}
          >
            {busy
              ? 'Checking your access — this can take up to 10 seconds. No need to click again.'
              : mode === 'google'
                ? 'Academic project for HIT — authorized security testing only.'
                : 'Academic demo for HIT — signs you in as a sample analyst with simulated scan data.'}
          </Typography.Text>
        </Space>
      </Card>
    </Flex>
  )
}
