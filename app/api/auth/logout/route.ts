import { NextResponse } from 'next/server'
import { ANY_ROLE, clearSessionCookie, withAuth } from '@/lib/api/handler'
import { logout } from '@/lib/services/authService'
import { SESSION_COOKIE } from '@/lib/security/tokens'

export const POST = withAuth(ANY_ROLE, async (req) => {
  await logout(req.cookies.get(SESSION_COOKIE)?.value)
  const res = new NextResponse(null, { status: 204 })
  clearSessionCookie(res)
  return res
})
