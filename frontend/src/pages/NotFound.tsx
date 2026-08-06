import { ResultPage } from '@/components/ui/ResultPage'

export default function NotFound() {
  return (
    <ResultPage
      center
      status="404"
      title="404"
      subTitle="This route never made it past the perimeter."
      actions={[
        { label: 'Back to overview', to: '/', primary: true },
        { label: 'New scan', to: '/scans/new' },
      ]}
    />
  )
}
