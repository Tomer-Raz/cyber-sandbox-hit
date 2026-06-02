import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { Backdrop } from '@/components/layout/Backdrop'
import { Toaster } from '@/components/ui/Toaster'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ScansList from '@/pages/ScansList'
import NewScan from '@/pages/NewScan'
import ScanStatus from '@/pages/ScanStatus'
import Report from '@/pages/Report'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <>
      <Backdrop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="scans" element={<ScansList />} />
          <Route path="scans/new" element={<NewScan />} />
          <Route path="scans/:id" element={<ScanStatus />} />
          <Route path="scans/:id/report" element={<Report />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  )
}
