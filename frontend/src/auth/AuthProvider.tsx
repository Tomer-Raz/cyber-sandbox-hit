import { MockAuthProvider } from './MockAuthProvider'
import { MsalAuthProvider } from './MsalAuthProvider'

const MODE = import.meta.env.VITE_AUTH_MODE ?? 'mock'

/**
 * Selects the auth implementation at build time.
 *  - "mock" (default): instant demo login, no backend or tenant required.
 *  - "msal": real Microsoft Entra ID via @azure/msal-react.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (MODE === 'msal') return <MsalAuthProvider>{children}</MsalAuthProvider>
  return <MockAuthProvider>{children}</MockAuthProvider>
}
