import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleOAuthProvider, googleLogout } from '@react-oauth/google'
import type { AppUser } from '@/types'
import { http, registerTokenGetter, registerUnauthorizedHandler } from '@/api/client'
import { initialsFromName } from '@/lib/format'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'
import { googleClientId } from './googleConfig'
import { decodeIdToken, millisUntilExpiry } from './idToken'

interface BackendUser {
  id: string
  email: string
  name: string
  role: string
}

function backendUserToAppUser(user: BackendUser): AppUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    org: 'Google Account',
    initials: initialsFromName(user.name),
  }
}

function GoogleBridge({ children }: { children: React.ReactNode }) {
  // The ID token itself is the bearer credential. The backend verifies its
  // signature and checks aud === VITE_GOOGLE_CLIENT_ID, which is what makes a
  // token minted for some other Google app unusable here.
  const tokenRef = useRef<string | null>(null)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('idle')

  const logout = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current)
    expiryTimer.current = null
    tokenRef.current = null
    googleLogout()
    setUser(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current)
    registerUnauthorizedHandler(logout)
  }, [logout])

  useEffect(() => () => void (expiryTimer.current && clearTimeout(expiryTimer.current)), [])

  const loginWithCredential = useCallback(
    async (credential: string) => {
      const claims = decodeIdToken(credential)
      if (!claims) {
        setStatus('idle')
        throw new Error('Malformed Google credential')
      }

      setStatus('loading')
      // Set the token before the request so the axios interceptor (registered
      // above via registerTokenGetter) attaches it as the bearer automatically.
      tokenRef.current = credential

      let backendUser: BackendUser
      try {
        const res = await http.get<BackendUser>('/auth/me')
        backendUser = res.data
      } catch (err) {
        // The backend is the only thing that actually verifies this token
        // (signature, audience, issuer) — a rejection here means the
        // credential does not authenticate, regardless of what it decodes to.
        tokenRef.current = null
        setStatus('idle')
        throw err
      }

      setUser(backendUserToAppUser(backendUser))
      setStatus('authenticated')

      // Google ID tokens last an hour. Drop the session exactly when the token
      // dies rather than letting the app send an expired bearer.
      const ttl = millisUntilExpiry(claims)
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
      expiryTimer.current = ttl > 0 ? setTimeout(logout, ttl) : null
      if (ttl <= 0) logout()
    },
    [logout],
  )

  // Google's ID-token flow only comes from their rendered button, so there is
  // no programmatic entry point here. Login renders <GoogleLogin> instead.
  const login = useCallback(
    () => Promise.reject(new Error('Sign in using the Google button')),
    [],
  )

  const value: AuthContextValue = {
    user,
    isAuthenticated: status === 'authenticated' && !!user,
    status,
    mode: 'google',
    login,
    logout,
    getToken: () => tokenRef.current,
    loginWithCredential,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Real Google OAuth provider (used when VITE_AUTH_MODE=google). */
export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  if (!googleClientId) {
    throw new Error(
      'VITE_AUTH_MODE=google requires VITE_GOOGLE_CLIENT_ID to be set at build time.',
    )
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <GoogleBridge>{children}</GoogleBridge>
    </GoogleOAuthProvider>
  )
}
