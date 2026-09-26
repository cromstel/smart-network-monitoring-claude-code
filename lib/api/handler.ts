/**
 * Route-handler plumbing: authentication, per-route authorisation, validation, error envelope.
 * Middleware only checks that a session cookie is present; this is where it is verified and
 * where the role is checked (PRD F-62 — "and", not "or").
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { getConfig } from '@/lib/config'
import { validateSession, type AuthContext } from '@/lib/services/authService'
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/security/tokens'
import type { Role } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { LIMITS, hit } from '@/lib/utils/rateLimit'
import { AppError, invalidBody, invalidQuery, rateLimited } from './errors'

export const ANY_ROLE: readonly Role[] = ['ADMIN', 'MEMBER', 'VIEWER']
export const WRITERS: readonly Role[] = ['ADMIN', 'MEMBER']
export const ADMIN_ONLY: readonly Role[] = ['ADMIN']

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const res = NextResponse.json(
      { error: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) },
      { status: err.status },
    )
    if (err.retryAfterSeconds) res.headers.set('Retry-After', String(err.retryAfterSeconds))
    return res
  }
  // Never return a raw exception message: stack traces and connection strings leak that way.
  logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) }, 'unhandled route error')
  return NextResponse.json({ error: 'INTERNAL', message: 'Something went wrong. The error has been logged.' }, { status: 500 })
}

export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip')
}

type RoleCheck = { ok: true; auth: AuthContext } | { ok: false; response: NextResponse }

/** IMPLEMENTATION.md §3 contract: returns a ready response on failure. */
export async function requireRole(req: NextRequest, roles: readonly Role[]): Promise<RoleCheck> {
  try {
    return { ok: true, auth: await authorise(req, roles) }
  } catch (err) {
    return { ok: false, response: errorResponse(err) }
  }
}

export async function authorise(req: NextRequest, roles: readonly Role[]): Promise<AuthContext> {
  const auth = await validateSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!auth) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.')
  const limit = hit(`api:${auth.session.id}`, LIMITS.api.limit, LIMITS.api.windowMs)
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds)
  if (!roles.includes(auth.user.role)) throw new AppError('FORBIDDEN', 'Your role does not allow this action.')
  return auth
}

type Segment<P> = { params: Promise<P> }

/** Wraps a handler with session + role enforcement and the error envelope. */
export function withAuth<P = Record<string, string>>(
  roles: readonly Role[],
  handler: (req: NextRequest, ctx: { auth: AuthContext; params: P }) => Promise<Response>,
) {
  return async (req: NextRequest, segment: Segment<P>): Promise<Response> => {
    try {
      const auth = await authorise(req, roles)
      const params = segment?.params ? await segment.params : ({} as P)
      return await handler(req, { auth, params })
    } catch (err) {
      return errorResponse(err)
    }
  }
}

/** For the few public routes: still gets the error envelope. */
export function publicRoute<P = Record<string, string>>(handler: (req: NextRequest, ctx: { params: P }) => Promise<Response>) {
  return async (req: NextRequest, segment: Segment<P>): Promise<Response> => {
    try {
      const params = segment?.params ? await segment.params : ({} as P)
      return await handler(req, { params })
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export function parseQuery<S extends z.ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const raw = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw invalidQuery(parsed.error.flatten(), parsed.error.issues[0] ? `${parsed.error.issues[0].path.join('.') || 'query'}: ${parsed.error.issues[0].message}` : undefined)
  }
  return parsed.data
}

export async function parseBody<S extends z.ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    const text = await req.text()
    raw = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    throw invalidBody(undefined, 'The request body must be valid JSON.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw invalidBody(parsed.error.flatten(), parsed.error.issues[0] ? `${parsed.error.issues[0].path.join('.') || 'body'}: ${parsed.error.issues[0].message}` : undefined)
  }
  return parsed.data
}

export function cookieSecure(): boolean {
  const cfg = getConfig()
  return cfg.COOKIE_SECURE ?? cfg.NODE_ENV === 'production'
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: cookieSecure(), path: '/', maxAge: 0 })
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init)
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}
