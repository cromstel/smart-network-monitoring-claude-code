/** Server Components: resolve the current user from the request cookies. */
import { cookies } from 'next/headers'
import { validateSession, type AuthContext } from '@/lib/services/authService'
import { SESSION_COOKIE } from '@/lib/security/tokens'

export async function getCurrentSession(): Promise<AuthContext | null> {
  const store = await cookies()
  return validateSession(store.get(SESSION_COOKIE)?.value)
}
