import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginForm } from '@/components/auth/LoginForm'
import { getCurrentSession } from '@/lib/auth/session'
import { needsSetup } from '@/lib/services/authService'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup')
  if (await getCurrentSession()) redirect('/')
  return (
    <AuthFrame eyebrow="Network monitor" title="Sign in">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  )
}
