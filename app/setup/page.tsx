import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { SetupForm } from '@/components/auth/SetupForm'
import { needsSetup } from '@/lib/services/authService'

export const metadata: Metadata = { title: 'First-run setup' }
export const dynamic = 'force-dynamic'

/** Reachable only until the first user exists (PRD F-63). */
export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')
  return (
    <AuthFrame eyebrow="First-run setup" title="Create the admin account">
      <p className="-mt-3 mb-5 text-sm text-muted">This account can manage users, the router, and network settings. You can add more people later.</p>
      <SetupForm />
    </AuthFrame>
  )
}
