/**
 * Fixed-window, in-process rate limiter. One installation runs one Node process, so
 * process memory is the right store; a multi-replica deployment would need a shared one.
 */
interface Window {
  count: number
  resetAt: number
}

const g = globalThis as unknown as { __snmRateLimits?: Map<string, Window> }
const windows: Map<string, Window> = g.__snmRateLimits ?? new Map()
g.__snmRateLimits = windows

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

function current(key: string, windowMs: number, now: number): Window {
  const existing = windows.get(key)
  if (existing && existing.resetAt > now) return existing
  const fresh = { count: 0, resetAt: now + windowMs }
  windows.set(key, fresh)
  return fresh
}

/** Check without consuming. */
export function peek(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const w = current(key, windowMs, now)
  return {
    allowed: w.count < limit,
    remaining: Math.max(0, limit - w.count),
    retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
  }
}

/** Consume one unit; returns whether the call was allowed. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const w = current(key, windowMs, now)
  if (w.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) }
  }
  w.count++
  return { allowed: true, remaining: limit - w.count, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) }
}

export function reset(key: string): void {
  windows.delete(key)
}

/** Drop expired windows so the map cannot grow without bound. */
export function sweep(now = Date.now()): void {
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key)
}

export function resetAllForTests(): void {
  windows.clear()
}

export const LIMITS = {
  login: { limit: 5, windowMs: 15 * 60_000 },
  scan: { limit: 10, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
} as const
