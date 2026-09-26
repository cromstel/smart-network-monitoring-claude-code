import { NextResponse } from 'next/server'
import { clientIp, parseBody, publicRoute, setSessionCookie } from '@/lib/api/handler'
import { AppError, rateLimited } from '@/lib/api/errors'
import { loginBody } from '@/lib/api/schemas'
import { toUserDTO } from '@/lib/api/serialisers'
import { login } from '@/lib/services/authService'
import { LIMITS, hit, peek, reset } from '@/lib/utils/rateLimit'

/** Public, rate-limited: 5 failed attempts per 15 minutes per IP (API.md). */
export const POST = publicRoute(async (req) => {
  const key = `login:${clientIp(req) ?? 'unknown'}`
  const check = peek(key, LIMITS.login.limit, LIMITS.login.windowMs)
  if (!check.allowed) throw rateLimited(check.retryAfterSeconds)

  const body = await parseBody(req, loginBody)
  try {
    const result = await login(body.email, body.password, { ip: clientIp(req), userAgent: req.headers.get('user-agent') })
    reset(key)
    const res = NextResponse.json({ data: toUserDTO(result.user) })
    setSessionCookie(res, result.token)
    return res
  } catch (err) {
    if (err instanceof AppError && err.code === 'UNAUTHENTICATED') hit(key, LIMITS.login.limit, LIMITS.login.windowMs)
    throw err
  }
})
