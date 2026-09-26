import { defaultResolution, downsample, floorHour } from '@/lib/services/bandwidthService'

it('defaults to raw for short ranges and hourly for long ones', () => {
  expect(defaultResolution('1h')).toBe('raw')
  expect(defaultResolution('24h')).toBe('raw')
  expect(defaultResolution('7d')).toBe('hourly')
  expect(defaultResolution('30d')).toBe('hourly')
})

it('floors to the UTC hour', () => {
  expect(floorHour(new Date('2026-09-24T12:34:56.789Z')).toISOString()).toBe('2026-09-24T12:00:00.000Z')
})

it('downsamples into buckets: averages speeds, sums bytes exactly', () => {
  const from = new Date('2026-09-24T00:00:00Z')
  const to = new Date('2026-09-24T01:00:00Z')
  const points = Array.from({ length: 120 }, (_, i) => ({
    timestamp: new Date(from.getTime() + i * 30_000),
    uploadMbps: 1,
    downloadMbps: i % 2 === 0 ? 10 : 20,
    uploadBytes: BigInt('4503599627370496'), // 2^52 — sums past MAX_SAFE_INTEGER must stay exact
    downloadBytes: BigInt(1),
  }))
  const out = downsample(points, from, to, 10)
  expect(out).toHaveLength(10)
  expect(out[0]?.downloadMbps).toBe(15)
  expect(out[0]?.uploadBytes).toBe((BigInt('4503599627370496') * BigInt(12)).toString())
  expect(out.reduce((s, p) => s + BigInt(p.downloadBytes), BigInt(0))).toBe(BigInt(120))
})

it('passes small series through unchanged', () => {
  const from = new Date(0)
  const pts = [{ timestamp: new Date(1000), uploadMbps: 1.23456, downloadMbps: 2, uploadBytes: BigInt(5), downloadBytes: BigInt(6) }]
  expect(downsample(pts, from, new Date(2000))).toEqual([{ timestamp: new Date(1000), uploadMbps: 1.235, downloadMbps: 2, uploadBytes: '5', downloadBytes: '6' }])
})
