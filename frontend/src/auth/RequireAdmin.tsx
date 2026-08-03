import { Link } from 'react-router-dom'
import { Button, Result } from 'antd'
import { ADMIN_ROLE } from '@/types'
import { useAuth } from './AuthContext'

/**
 * Route guard for the admin console.
 *
 * Cosmetic only — the role it reads came from the backend, which independently
 * rejects every /api/admin call from a non-admin. Nothing here is what keeps
 * another user's data private.
 */
export function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useAuth()

  if (user?.role !== ADMIN_ROLE) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="This area is limited to administrators."
        extra={
          <Link to="/">
            <Button type="primary">Back to overview</Button>
          </Link>
        }
      />
    )
  }
  return children
}
