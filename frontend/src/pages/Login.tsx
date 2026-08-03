import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { GoogleOutlined } from '@ant-design/icons'
import { GoogleLogin } from '@react-oauth/google'
import { Button, Card, Flex, Space, Spin, Typography } from 'antd'
import { useAuth } from '@/auth/AuthContext'
import { toast } from '@/lib/notify'
import { Brand } from '@/components/Brand'
import { APP_TAGLINE } from '@/lib/constants'

export default function Login() {
  const { login, loginWithCredential, isAuthenticated, status, mode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // Refreshing on /login with a stored session would otherwise flash the
  // sign-in card before the redirect lands.
  if (status === 'restoring') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100dvh' }}>
        <Spin size="large" />
      </Flex>
    )
  }
  if (isAuthenticated) return <Navigate to={from} replace />

  const handleLogin = async () => {
    setSubmitting(true)
    try {
      await login()
      toast.success('Signed in to the Sandbox console')
      navigate(from, { replace: true })
    } catch {
      toast.error('Sign-in failed', 'Could not start a session. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Google hands back an ID token (JWT) from its own rendered button; the
  // backend verifies it. Nothing is trusted from the client side here.
  const handleGoogleCredential = async (credential?: string) => {
    if (!credential || !loginWithCredential) {
      toast.error('Sign-in failed', 'Google did not return a credential.')
      return
    }
    try {
      await loginWithCredential(credential)
      toast.success('Signed in to the Sandbox console')
      navigate(from, { replace: true })
    } catch {
      toast.error('Sign-in failed', 'The backend rejected this credential. Try again.')
    }
  }

  const busy = submitting || status === 'loading'

  return (
    <Flex
      align="center"
      justify="center"
      style={{ minHeight: '100dvh', padding: 16, background: '#f5f5f5' }}
    >
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
            </Flex>
          ) : (
            <Button
              type="primary"
              size="large"
              block
              icon={<GoogleOutlined />}
              loading={busy}
              onClick={handleLogin}
            >
              Continue with Google
            </Button>
          )}

          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', textAlign: 'center' }}
          >
            {mode === 'google'
              ? 'Academic project for HIT — authorized security testing only.'
              : 'Academic demo for HIT — signs you in as a sample analyst with simulated scan data.'}
          </Typography.Text>
        </Space>
      </Card>
    </Flex>
  )
}
