import { useCallback, useEffect, useRef, useState } from 'react'
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react'
import type { AppUser } from '@/types'
import { registerTokenGetter, registerUnauthorizedHandler } from '@/api/client'
import { initialsFromName } from '@/lib/format'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'
import { loginRequest, msalConfig } from './msalConfig'

function accountToUser(a: AccountInfo): AppUser {
  const name = a.name ?? a.username ?? 'Member'
  return {
    id: a.localAccountId,
    name,
    email: a.username ?? '',
    role: 'Member',
    org: 'Microsoft Entra ID',
    initials: initialsFromName(name),
  }
}

function MsalBridge({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = accounts[0] ?? null
  const tokenRef = useRef<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>(isAuthenticated ? 'authenticated' : 'idle')

  const logout = useCallback(() => {
    tokenRef.current = null
    void instance.logoutPopup()
  }, [instance])

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current)
    registerUnauthorizedHandler(logout)
  }, [logout])

  // Keep an access token cached for the request interceptor.
  useEffect(() => {
    let alive = true
    if (account) {
      instance
        .acquireTokenSilent({ ...loginRequest, account })
        .then((res) => {
          if (alive) tokenRef.current = res.accessToken
        })
        .catch(() => {
          /* interactive token will be fetched on next login */
        })
      setStatus('authenticated')
    } else {
      setStatus('idle')
    }
    return () => {
      alive = false
    }
  }, [account, instance])

  const login = useCallback(async () => {
    setStatus('loading')
    try {
      await instance.loginPopup(loginRequest)
    } finally {
      setStatus(instance.getAllAccounts().length ? 'authenticated' : 'idle')
    }
  }, [instance])

  const value: AuthContextValue = {
    user: account ? accountToUser(account) : null,
    isAuthenticated,
    status,
    mode: 'msal',
    login,
    logout,
    getToken: () => tokenRef.current,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Real Microsoft Entra ID provider (used when VITE_AUTH_MODE=msal). */
export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  const [instance] = useState(() => new PublicClientApplication(msalConfig))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    instance
      .initialize()
      .then(() => setReady(true))
      .catch(() => setReady(true))
  }, [instance])

  if (!ready) return null

  return (
    <MsalProvider instance={instance}>
      <MsalBridge>{children}</MsalBridge>
    </MsalProvider>
  )
}
