import { bytesToMegabytes, displayName, formatBytes, formatDuration, formatMbps, formatRelativeTime, formatSignal } from '@/lib/utils/format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1_073_741_824, '1.0 GB'],
    ['9007199254740993', '8.0 PB'], // beyond MAX_SAFE_INTEGER, as a string — AUDIT A-05 guard
    [BigInt('18446744073709551615'), '16.0 EB'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected)
  })

  it.each([null, undefined, '', 'not-a-number'])('renders %p as an em dash', (input) => {
    expect(formatBytes(input as string)).toBe('—')
  })

  it('clamps negatives to zero', () => {
    expect(formatBytes(-5)).toBe('0 B')
  })
})

describe('bytesToMegabytes', () => {
  it.each([
    ['0', 0],
    ['1500000', 1.5],
    ['9007199254740993', 9007199254.74],
  ])('%s bytes -> %s MB', (bytes, mb) => {
    expect(bytesToMegabytes(bytes)).toBeCloseTo(mb, 2)
  })
  it('returns 0 for garbage', () => {
    expect(bytesToMegabytes('abc')).toBe(0)
  })
})

describe('formatMbps', () => {
  it.each([
    [0, '0 Mbps'],
    [0.45, '450 Kbps'],
    [5.55, '5.5 Mbps'],
    [120.4, '120 Mbps'],
    [1500, '1.50 Gbps'],
    [null, '—'],
    [Number.NaN, '—'],
  ])('%s -> %s', (v, s) => {
    expect(formatMbps(v)).toBe(s)
  })
})

describe('formatDuration', () => {
  it.each([
    [5, '5s'],
    [125, '2m'],
    [3700, '1h 1m'],
    [90000, '1d 1h'],
    [null, '—'],
    [-1, '—'],
  ])('%s -> %s', (v, s) => {
    expect(formatDuration(v)).toBe(s)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  it.each([
    ['2026-09-24T11:59:55Z', 'just now'],
    ['2026-09-24T11:59:30Z', '30s ago'],
    ['2026-09-24T11:30:00Z', '30m ago'],
    ['2026-09-24T09:00:00Z', '3h ago'],
    ['2026-09-21T12:00:00Z', '3d ago'],
  ])('%s -> %s', (t, s) => {
    expect(formatRelativeTime(t, now)).toBe(s)
  })
  it('handles missing and invalid input', () => {
    expect(formatRelativeTime(null)).toBe('—')
    expect(formatRelativeTime('nope', now)).toBe('—')
  })
})

describe('displayName', () => {
  it('prefers the user-set name, then hostname, then MAC', () => {
    expect(displayName({ deviceName: 'TV', hostname: 'tv-01', macAddress: 'AA' })).toBe('TV')
    expect(displayName({ deviceName: null, hostname: 'tv-01', macAddress: 'AA' })).toBe('tv-01')
    expect(displayName({ deviceName: '  ', hostname: null, macAddress: 'A4:83:E7:2C:11:09' })).toBe('A4:83:E7:2C:11:09')
  })
})

it('formats signal strength', () => {
  expect(formatSignal(-52)).toBe('-52 dBm')
  expect(formatSignal(null)).toBe('—')
})
