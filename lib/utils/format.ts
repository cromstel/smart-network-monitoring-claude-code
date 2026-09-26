/** Display formatting. Byte counters arrive as strings (they exceed Number.MAX_SAFE_INTEGER). */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'] as const

export function formatBytes(input: string | number | bigint | null | undefined, decimals = 1): string {
  if (input === null || input === undefined || input === '') return '—'
  let big: bigint
  try {
    big = typeof input === 'bigint' ? input : BigInt(typeof input === 'number' ? Math.trunc(input) : input)
  } catch {
    return '—'
  }
  if (big < BigInt(0)) big = BigInt(0)
  if (big < BigInt(1024)) return `${big.toString()} B`
  let unit = 0
  let divisor = BigInt(1)
  while (unit < UNITS.length - 1 && big >= divisor * BigInt(1024)) {
    divisor *= BigInt(1024)
    unit++
  }
  // Integer part via BigInt, fraction via Number on the remainder — exact for any size.
  const whole = big / divisor
  const fraction = Number(big % divisor) / Number(divisor)
  return `${(Number(whole) + fraction).toFixed(decimals)} ${UNITS[unit]}`
}

/** Bytes-as-string to megabytes as a Number (safe: 2^63 bytes is ~8.8e12 MB). */
export function bytesToMegabytes(bytes: string | number | bigint): number {
  try {
    const big = typeof bytes === 'bigint' ? bytes : BigInt(typeof bytes === 'number' ? Math.trunc(bytes) : bytes)
    return Math.round((Number(big / BigInt(1000)) / 1000) * 100) / 100
  } catch {
    return 0
  }
}

export function formatMbps(mbps: number | null | undefined): string {
  if (mbps === null || mbps === undefined || !Number.isFinite(mbps)) return '—'
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`
  if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
  if (mbps > 0) return `${(mbps * 1000).toFixed(0)} Kbps`
  return '0 Mbps'
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '—'
  const s = Math.floor(totalSeconds)
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${s}s`
}

export function formatRelativeTime(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return '—'
  const then = typeof date === 'string' ? new Date(date) : date
  const diff = Math.round((now.getTime() - then.getTime()) / 1000)
  if (!Number.isFinite(diff)) return '—'
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatSignal(dbm: number | null | undefined): string {
  if (dbm === null || dbm === undefined) return '—'
  return `${dbm} dBm`
}

/** Display name falls back: user-set name → hostname → MAC. */
export function displayName(d: { deviceName: string | null; hostname: string | null; macAddress: string }): string {
  return d.deviceName?.trim() || d.hostname?.trim() || d.macAddress
}
