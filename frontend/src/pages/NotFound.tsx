import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/Logo'

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <BrandMark size={56} />
        <div className="mt-6 font-display text-7xl font-bold tracking-tightest text-gradient">404</div>
        <h1 className="mt-2 font-display text-xl font-semibold text-ink">Lost in the sandbox</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          This route never made it past the perimeter. Let’s get you back to mission control.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button to="/" iconLeft="dashboard">
            Back to dashboard
          </Button>
          <Button to="/scans/new" variant="secondary" iconLeft="plus">
            New scan
          </Button>
        </div>
      </div>
    </div>
  )
}
