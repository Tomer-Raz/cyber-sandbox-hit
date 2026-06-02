import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/** Route guard — redirects unauthenticated users to /login. */
export function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return null
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}
