import { hit, peek, reset, resetAllForTests, sweep } from '@/lib/utils/rateLimit'

beforeEach(() => resetAllForTests())

it('allows up to the limit within a window, then refuses with Retry-After', () => {
  const t0 = 1_000_000
  for (let i = 0; i < 5; i++) expect(hit('k', 5, 60_000, t0).allowed).toBe(true)
  const blocked = hit('k', 5, 60_000, t0 + 1000)
  expect(blocked.allowed).toBe(false)
  expect(blocked.retryAfterSeconds).toBe(59)
  expect(peek('k', 5, 60_000, t0 + 1000).allowed).toBe(false)
})

it('opens a new window after expiry', () => {
  const t0 = 2_000_000
  for (let i = 0; i < 3; i++) hit('w', 3, 1000, t0)
  expect(hit('w', 3, 1000, t0 + 500).allowed).toBe(false)
  expect(hit('w', 3, 1000, t0 + 1001).allowed).toBe(true)
})

it('peek does not consume; reset clears; sweep drops expired windows', () => {
  expect(peek('p', 1, 1000, 0).remaining).toBe(1)
  expect(peek('p', 1, 1000, 0).remaining).toBe(1)
  hit('p', 1, 1000, 0)
  reset('p')
  expect(hit('p', 1, 1000, 1).allowed).toBe(true)
  sweep(10_000)
  expect(peek('p', 1, 1000, 10_001).remaining).toBe(1)
})
