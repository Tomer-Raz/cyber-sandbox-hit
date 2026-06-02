import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppUser } from '@/types'
import { registerTokenGetter, registerUnauthorizedHandler } from '@/api/client'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'

const STORAGE_KEY = 'sbx.auth.session'

const DEMO_USER: AppUser = {
  id: 'usr_john',
  name: 'John Doe',
  email: 'john.doe@hit.ac.il',
  role: 'Security Analyst',
  org: 'HIT · Cyber Lab',
  initials: 'JD',
}

interface StoredSession {
  user: AppUser
  token: string
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function fakeJwt(user: AppUser): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  const header = enc({ alg: 'demo', typ: 'JWT' })
  const payload = enc({
    sub: user.id,
    name: user.name,
    email: user.email,
    iss: 'sandbox-mock',
    iat: Math.floor(Date.now() / 1000),
  })
  return `${header}.${payload}.mock-signature`
}

/** Demo auth — instant login, no Entra tenant required. Persists to localStorage. */
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const initial = loadSession()
  const [user, setUser] = useState<AppUser | null>(initial?.user ?? null)
  const [status, setStatus] = useState<AuthStatus>(initial ? 'authenticated' : 'idle')
  const tokenRef = useRef<string | null>(initial?.token ?? null)

  const logout = useCallback(() => {
    tokenRef.current = null
    setUser(null)
    setStatus('idle')
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current)
    registerUnauthorizedHandler(logout)
  }, [logout])

  const login = useCallback(async () => {
    setStatus('loading')
    await new Promise((r) => setTimeout(r, 720))
    const token = fakeJwt(DEMO_USER)
    tokenRef.current = token
    setUser(DEMO_USER)
    setStatus('authenticated')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: DEMO_USER, token }))
  }, [])

  const value: AuthContextValue = {
    user,
    isAuthenticated: status === 'authenticated' && !!user,
    status,
    mode: 'mock',
    login,
    logout,
    getToken: () => tokenRef.current,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
