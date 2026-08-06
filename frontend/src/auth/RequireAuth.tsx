import { Navigate, useLocation } from 'react-router-dom'
import { CenteredSpin } from '@/components/ui/CenteredSpin'
import { useAuth } from './AuthContext'

/** Route guard — redirects unauthenticated users to /login. */
export function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()

  // Redirecting while the stored session is still being revalidated would make
  // every refresh look like being kicked out.
  if (status === 'restoring' || status === 'loading') return <CenteredSpin />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}
