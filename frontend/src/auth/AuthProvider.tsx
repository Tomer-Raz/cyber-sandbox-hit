import { MockAuthProvider } from './MockAuthProvider'
import { GoogleAuthProvider } from './GoogleAuthProvider'

const MODE = import.meta.env.VITE_AUTH_MODE ?? 'mock'

/** Picks the auth implementation at build time: "mock" (default) or "google". */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (MODE === 'google') return <GoogleAuthProvider>{children}</GoogleAuthProvider>
  return <MockAuthProvider>{children}</MockAuthProvider>
}
