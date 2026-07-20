import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GoogleOAuthProvider,
  googleLogout,
  useGoogleLogin,
  type TokenResponse,
} from '@react-oauth/google'
import type { AppUser } from '@/types'
import { registerTokenGetter, registerUnauthorizedHandler } from '@/api/client'
import { initialsFromName } from '@/lib/format'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'
import { googleClientId, googleScopes } from './googleConfig'

interface GoogleUserInfo {
  sub: string
  name?: string
  email?: string
  picture?: string
}

function infoToUser(info: GoogleUserInfo): AppUser {
  const name = info.name ?? info.email ?? 'Member'
  return {
    id: info.sub,
    name,
    email: info.email ?? '',
    role: 'Member',
    org: 'Google Account',
    initials: initialsFromName(name),
  }
}

function GoogleBridge({ children }: { children: React.ReactNode }) {
  const tokenRef = useRef<string | null>(null)
  const pending = useRef<{ resolve: () => void; reject: (e?: unknown) => void } | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('idle')

  const logout = useCallback(() => {
    tokenRef.current = null
    googleLogout()
    setUser(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current)
    registerUnauthorizedHandler(logout)
  }, [logout])

  // The Google access token is used as the bearer for the FastAPI backend,
  // which verifies it against the OAuth client ID.
  const runLogin = useGoogleLogin({
    scope: googleScopes,
    onSuccess: async (resp: TokenResponse) => {
      tokenRef.current = resp.access_token
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${resp.access_token}` },
        })
        setUser(infoToUser((await r.json()) as GoogleUserInfo))
      } catch {
        setUser(infoToUser({ sub: 'google-user' }))
      }
      setStatus('authenticated')
      pending.current?.resolve()
      pending.current = null
    },
    onError: (err) => {
      setStatus('idle')
      pending.current?.reject(err)
      pending.current = null
    },
  })

  const login = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject }
        setStatus('loading')
        runLogin()
      }),
    [runLogin],
  )

  const value: AuthContextValue = {
    user,
    isAuthenticated: status === 'authenticated' && !!user,
    status,
    mode: 'google',
    login,
    logout,
    getToken: () => tokenRef.current,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Real Google OAuth provider (used when VITE_AUTH_MODE=google). */
export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <GoogleBridge>{children}</GoogleBridge>
    </GoogleOAuthProvider>
  )
}
