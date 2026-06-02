import { createContext, useContext } from 'react'
import type { AppUser } from '@/types'

export type AuthStatus = 'idle' | 'loading' | 'authenticated'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean
  status: AuthStatus
  mode: 'mock' | 'msal'
  login: () => Promise<void>
  logout: () => void
  getToken: () => string | null
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
