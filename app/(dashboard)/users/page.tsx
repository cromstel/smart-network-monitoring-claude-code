import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { UsersView } from '@/components/users/UsersView'
import { getCurrentSession } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Users' }

export default async function UsersPage() {
  const auth = await getCurrentSession()
  if (auth?.user.role !== 'ADMIN') redirect('/')
  return <UsersView />
}
