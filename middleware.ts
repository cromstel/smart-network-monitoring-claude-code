/**
 * First gate only: is there a session cookie at all? The session itself is verified — and the
 * role checked — in every route handler and in the dashboard layout (PRD F-62). Middleware
 * alone is not authorisation, and it runs without database access.
 */
import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'snm_session'
const SESSION_MAX_AGE = 7 * 24 * 3600

const PUBLIC_PAGES = ['/login', '/setup']
const PUBLIC_API = ['/api/health', '/api/auth/login', '/api/setup', '/api/setup/status']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PAGES.includes(pathname) || PUBLIC_API.includes(pathname)
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE)?.value

  if (isPublicPath(pathname)) return NextResponse.next()

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to continue.' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  // Sliding expiry: the cookie's lifetime follows the server-side session's.
  const res = NextResponse.next()
  if (req.method === 'GET' && !pathname.startsWith('/api/')) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
}
