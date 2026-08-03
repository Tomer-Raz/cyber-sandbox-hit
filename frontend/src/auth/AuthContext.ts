import { createContext, useContext } from 'react'
import type { AppUser } from '@/types'

/**
 * `restoring` is the page-load state: a stored credential exists and is being
 * revalidated. It is distinct from `loading` (an in-flight sign-in the user
 * just triggered) because guards must wait it out rather than treat it as
 * signed-out — otherwise a refresh bounces to /login.
 */
export type AuthStatus = 'idle' | 'restoring' | 'loading' | 'authenticated'

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
  /**
   * Completes sign-in from a Google ID token (JWT). Present in google mode.
   * Sends the token to the backend, which verifies it and returns the
   * canonical user record — nothing here is trusted client-side alone.
   */
  loginWithCredential?: (credential: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
