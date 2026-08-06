import { ADMIN_ROLE } from '@/types'
import { ResultPage } from '@/components/ui/ResultPage'
import { useAuth } from './AuthContext'

/**
 * Cosmetic guard only — the role it reads came from the backend, which
 * independently rejects every /api/admin call from a non-admin.
 */
export function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useAuth()

  if (user?.role !== ADMIN_ROLE) {
    return (
      <ResultPage
        status="403"
        title="403"
        subTitle="This area is limited to administrators."
        actions={[{ label: 'Back to overview', to: '/', primary: true }]}
      />
    )
  }
  return children
}
