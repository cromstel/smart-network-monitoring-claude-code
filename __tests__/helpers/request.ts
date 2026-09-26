import { NextRequest } from 'next/server'

export function req(path: string, init: { method?: string; token?: string; body?: unknown; ip?: string } = {}): NextRequest {
  const headers = new Headers()
  if (init.token) headers.set('cookie', `snm_session=${init.token}`)
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  headers.set('x-forwarded-for', init.ip ?? '10.0.0.1')
  return new NextRequest(new URL(path, 'http://localhost'), {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}

export function ctx<P extends Record<string, string>>(params: P = {} as P): { params: Promise<P> } {
  return { params: Promise.resolve(params) }
}
