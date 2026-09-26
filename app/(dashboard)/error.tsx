'use client'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/states'

/** Error boundary for every dashboard page: a crash in one view never blanks the shell. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <ErrorState error={new Error(error.digest ? `Unexpected error (ref ${error.digest}).` : 'Unexpected error.')} onRetry={reset} />
    </Card>
  )
}
