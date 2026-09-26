import Link from 'next/link'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <AuthFrame eyebrow="404" title="No such page">
      <p className="mb-5 text-sm text-muted">Nothing is listening at this address.</p>
      <Button asChild variant="primary" className="w-full"><Link href="/">Back to the dashboard</Link></Button>
    </AuthFrame>
  )
}
