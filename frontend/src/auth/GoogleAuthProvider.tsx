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

const STORAGE_KEY = 'sbx.auth.google.credential'

/**
 * sessionStorage rather than localStorage: this is the live bearer credential,
 * so it stays scoped to the tab and dies with it. Surviving a reload is the
 * point; surviving a closed browser is not worth the wider exposure, and the
 * token is only valid for an hour anyway.
 */
function readStoredCredential(): string | null {
  try {
    const token = sessionStorage.getItem(STORAGE_KEY)
    if (!token) return null
    // Expiry is checked here so an expired token never causes a doomed
    // /auth/me round trip on every page load.
    if (millisUntilExpiry(decodeIdToken(token)) <= 0) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

function GoogleBridge({ children }: { children: React.ReactNode }) {
  // The ID token itself is the bearer credential. The backend verifies its
  // signature and checks aud === VITE_GOOGLE_CLIENT_ID, which is what makes a
  // token minted for some other Google app unusable here.
  //
  // Read once, synchronously, so the very first render already knows whether a
  // session is being restored. Deciding that in an effect would render one
  // frame as signed-out, which is exactly what bounced refreshes to /login.
  const [storedCredential] = useState(readStoredCredential)
  const tokenRef = useRef<string | null>(storedCredential)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(storedCredential ? 'restoring' : 'idle')

  const logout = useCallback(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current)
    expiryTimer.current = null
    tokenRef.current = null
    sessionStorage.removeItem(STORAGE_KEY)
    googleLogout()
    setUser(null)
    setStatus('idle')
  }, [])

  // Google ID tokens last an hour. Drop the session exactly when the token
  // dies rather than letting the app send an expired bearer.
  const armExpiry = useCallback(
    (credential: string) => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
      const ttl = millisUntilExpiry(decodeIdToken(credential))
      expiryTimer.current = ttl > 0 ? setTimeout(logout, ttl) : null
      if (ttl <= 0) logout()
    },
    [logout],
  )

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current)
    registerUnauthorizedHandler(logout)
  }, [logout])

  // Declared after the registration effect above so the token getter is live
  // before this fires — /auth/me must go out with the restored bearer attached.
  useEffect(() => {
    if (!storedCredential) return
    let cancelled = false

    void (async () => {
      try {
        const { data } = await http.get<BackendUser>('/auth/me')
        if (cancelled) return
        setUser(backendUserToAppUser(data))
        setStatus('authenticated')
        armExpiry(storedCredential)
      } catch {
        // Revalidation is the whole point of restoring through the backend: a
        // revoked or tampered token must not survive a refresh.
        if (!cancelled) logout()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [storedCredential, armExpiry, logout])

  useEffect(() => () => void (expiryTimer.current && clearTimeout(expiryTimer.current)), [])

  const loginWithCredential = useCallback(
    async (credential: string) => {
      if (!decodeIdToken(credential)) {
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

      // Only persisted once the backend has accepted it, so a rejected
      // credential can't be replayed on the next page load.
      try {
        sessionStorage.setItem(STORAGE_KEY, credential)
      } catch {
        // Private-mode quota failures cost persistence across reloads, not the
        // session in hand.
      }

      setUser(backendUserToAppUser(backendUser))
      setStatus('authenticated')
      armExpiry(credential)
    },
    [armExpiry],
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
