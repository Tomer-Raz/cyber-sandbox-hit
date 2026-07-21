import { createContext, useContext } from 'react'
import type { AppUser } from '@/types'

export type AuthStatus = 'idle' | 'loading' | 'authenticated'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean
  status: AuthStatus
  mode: 'mock' | 'google'
  /**
   * Programmatic sign-in. Available in mock mode only — Google's ID-token flow
   * requires their own rendered button, so google mode exposes
   * `loginWithCredential` instead and rejects this call.
   */
  login: () => Promise<void>
  logout: () => void
  getToken: () => string | null
  /** Completes sign-in from a Google ID token (JWT). Present in google mode. */
  loginWithCredential?: (credential: string) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
