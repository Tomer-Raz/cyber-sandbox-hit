import { MockAuthProvider } from './MockAuthProvider'
import { GoogleAuthProvider } from './GoogleAuthProvider'

const MODE = import.meta.env.VITE_AUTH_MODE ?? 'mock'

/**
 * Selects the auth implementation at build time.
 *  - "mock" (default): instant demo login, no backend or OAuth client required.
 *  - "google": real Google OAuth via @react-oauth/google.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (MODE === 'google') return <GoogleAuthProvider>{children}</GoogleAuthProvider>
  return <MockAuthProvider>{children}</MockAuthProvider>
}
