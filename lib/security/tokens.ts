import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** 256-bit opaque session token. Lives only in the cookie. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * What the sessions table stores. HMAC keyed by SESSION_SECRET rather than a bare SHA-256,
 * so a leaked database alone cannot be used to test guessed tokens offline.
 */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export const SESSION_COOKIE = 'snm_session'
export const SESSION_TTL_MS = 7 * 24 * 3600_000
/** Extend when less than this remains — avoids a DB write on every request. */
export const SESSION_REFRESH_THRESHOLD_MS = 6 * 24 * 3600_000
