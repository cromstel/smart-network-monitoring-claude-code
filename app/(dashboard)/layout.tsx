import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { SessionProvider } from '@/components/layout/SessionContext'
import { toUserDTO } from '@/lib/api/serialisers'
import { getCurrentSession } from '@/lib/auth/session'
import { needsSetup } from '@/lib/services/authService'

export const dynamic = 'force-dynamic'

/** The authenticated shell — the only owner of /, /devices, /alerts, /router, /settings, /users. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentSession()
  if (!auth) redirect((await needsSetup()) ? '/setup' : '/login')
  return (
    <SessionProvider user={toUserDTO(auth.user)}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  )
}
