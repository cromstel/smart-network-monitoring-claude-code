import { NextResponse } from 'next/server'
import { clientIp, parseBody, publicRoute, setSessionCookie } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { setupBody } from '@/lib/api/schemas'
import { toUserDTO } from '@/lib/api/serialisers'
import { login, needsSetup, setup } from '@/lib/services/authService'

/** Public until the first user exists; 409 afterwards (PRD F-63). Signs the new admin in. */
export const POST = publicRoute(async (req) => {
  if (!(await needsSetup())) throw conflict('Setup has already been completed.')
  const body = await parseBody(req, setupBody)
  const user = await setup({ email: body.email, password: body.password, name: body.name ?? null })
  const session = await login(body.email, body.password, { ip: clientIp(req), userAgent: req.headers.get('user-agent') })
  const res = NextResponse.json({ data: toUserDTO(user) }, { status: 201 })
  setSessionCookie(res, session.token)
  return res
})
