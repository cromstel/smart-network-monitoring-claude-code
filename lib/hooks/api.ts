/** Browser-side fetch wrapper: JSON in/out, API error envelope -> ApiError. */
import type { ApiErrorBody } from '@/lib/types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(path, {
    ...rest,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
  if (res.status === 204) return undefined as T
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiErrorBody>
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/login') && !path.startsWith('/api/setup')) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
    throw new ApiError(res.status, err.error ?? 'INTERNAL', err.message ?? `Request failed (${res.status})`, err.details)
  }
  return body as T
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** Field errors from a Zod-flattened `details` payload. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {}
  const details = err.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(details?.fieldErrors ?? {})) if (v?.[0]) out[k] = v[0]
  return out
}
