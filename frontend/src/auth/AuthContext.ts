import { createContext, useContext } from 'react'
import type { AppUser } from '@/types'

// `restoring` (revalidating a stored credential on load) is distinct from
// `loading` (a sign-in the user just triggered): guards must wait `restoring`
// out rather than treat it as signed-out, or a refresh bounces to /login.
export type AuthStatus = 'idle' | 'restoring' | 'loading' | 'authenticated'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean
  status: AuthStatus
  mode: 'mock' | 'google'
  /** Mock mode only; google mode rejects this and exposes loginWithCredential. */
  login: () => Promise<void>
  logout: () => void
  getToken: () => string | null
  /** Google mode: hands the ID token to the backend, which verifies it. */
  loginWithCredential?: (credential: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
