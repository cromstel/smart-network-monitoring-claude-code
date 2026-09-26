import { errorResponse } from '@/lib/api/handler'
import { AppError, rateLimited } from '@/lib/api/errors'

it('never returns a raw exception message (API.md, IMPLEMENTATION §7)', async () => {
  const res = errorResponse(new Error('connect ECONNREFUSED mysql://root:hunter2@db:3306'))
  expect(res.status).toBe(500)
  const text = await res.text()
  expect(text).not.toMatch(/hunter2|ECONNREFUSED|mysql/)
  expect(JSON.parse(text)).toEqual({ error: 'INTERNAL', message: 'Something went wrong. The error has been logged.' })
})

it('maps typed errors to their status with a stable envelope', async () => {
  const res = errorResponse(new AppError('NOT_FOUND', 'Device not found.'))
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'NOT_FOUND', message: 'Device not found.' })
})

it('adds Retry-After to 429', () => {
  const res = errorResponse(rateLimited(42))
  expect(res.status).toBe(429)
  expect(res.headers.get('Retry-After')).toBe('42')
})
