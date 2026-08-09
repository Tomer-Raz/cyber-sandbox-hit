import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAdmin } from '@/auth/RequireAdmin'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { CenteredSpin } from '@/components/ui/CenteredSpin'
import Login from '@/pages/Login'

// Route-level code splitting keeps recharts and the heavier pages
// off the initial (mobile) payload.
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ScansList = lazy(() => import('@/pages/ScansList'))
const NewScan = lazy(() => import('@/pages/NewScan'))
const ScanStatus = lazy(() => import('@/pages/ScanStatus'))
const Report = lazy(() => import('@/pages/Report'))
const Settings = lazy(() => import('@/pages/Settings'))
const AdminUsers = lazy(() => import('@/pages/admin/Users'))
const AdminScans = lazy(() => import('@/pages/admin/Scans'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  return (
    <Suspense fallback={<CenteredSpin minHeight="50vh" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="scans" element={<ScansList />} />
          <Route path="scans/new" element={<NewScan />} />
          <Route path="scans/:id" element={<ScanStatus />} />
          <Route path="scans/:id/report" element={<Report />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="admin/users"
            element={
              <RequireAdmin>
                <AdminUsers />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/scans"
            element={
              <RequireAdmin>
                <AdminScans />
              </RequireAdmin>
            }
          />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}