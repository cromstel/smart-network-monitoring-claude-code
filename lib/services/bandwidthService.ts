/**
 * Bandwidth sampling, history and rollup.
 *
 * Scanners report cumulative byte counters as seen by the router (they reset on reboot or
 * reconnect). This service turns successive counter readings into:
 *   - instantaneous speed (Mbps) from the delta over elapsed time, and
 *   - the app's own monotonic cumulative total (PRD F-21), immune to counter resets.
 * All byte arithmetic is BigInt here and strings everywhere else (AUDIT A-05).
 */
import * as bandwidthRepo from '@/lib/db/repositories/bandwidthRepository'
import * as networkRepo from '@/lib/db/repositories/networkRepository'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import type { BandwidthPoint, BandwidthRange, BandwidthResolution, Device } from '@/lib/types'
import { displayName } from '@/lib/utils/format'
import { logger } from '@/lib/utils/logger'
import { getNetworkSettings } from './settingsService'

export const RANGE_MS: Record<BandwidthRange, number> = {
  '1h': 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

export function defaultResolution(range: BandwidthRange): BandwidthResolution {
  return range === '1h' || range === '24h' ? 'raw' : 'hourly'
}

/** Anything faster than this between two samples is a counter glitch, not traffic. */
const MAX_PLAUSIBLE_MBPS = 10_000
/** Charts never need more points than they have pixels. */
export const MAX_POINTS = 360

interface CounterReading {
  up: bigint
  down: bigint
  at: number
}

const g = globalThis as unknown as { __snmCounters?: Map<string, CounterReading> }
const lastReading: Map<string, CounterReading> = g.__snmCounters ?? new Map()
g.__snmCounters = lastReading

export interface CounterSample {
  device: Device
  uploadBytes?: string
  downloadBytes?: string
}

export interface Speed {
  uploadMbps: number
  downloadMbps: number
}

function big(value: string | undefined): bigint | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  return BigInt(value)
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Record one scan's counter readings. Returns speeds for devices that had a previous reading. */
export async function recordSamples(samples: CounterSample[], at: Date = new Date()): Promise<Map<string, Speed>> {
  const speeds = new Map<string, Speed>()
  const withCounters = samples.filter((s) => big(s.uploadBytes) !== null && big(s.downloadBytes) !== null)
  if (withCounters.length === 0) return speeds

  const totals = await bandwidthRepo.latestForDevices(withCounters.map((s) => s.device.id))
  const rows: bandwidthRepo.NewMetric[] = []

  for (const s of withCounters) {
    const up = big(s.uploadBytes) as bigint
    const down = big(s.downloadBytes) as bigint
    const key = s.device.macAddress
    const prev = lastReading.get(key)
    lastReading.set(key, { up, down, at: at.getTime() })
    if (!prev) continue // first reading after start or reconnect: a baseline, not a sample

    const seconds = (at.getTime() - prev.at) / 1000
    if (seconds <= 0) continue
    // A counter that went backwards was reset; everything it now shows is new traffic.
    const dUp = up >= prev.up ? up - prev.up : up
    const dDown = down >= prev.down ? down - prev.down : down
    const uploadMbps = (Number(dUp) * 8) / seconds / 1e6
    const downloadMbps = (Number(dDown) * 8) / seconds / 1e6
    if (uploadMbps > MAX_PLAUSIBLE_MBPS || downloadMbps > MAX_PLAUSIBLE_MBPS) {
      logger.warn({ deviceId: s.device.id, uploadMbps, downloadMbps }, 'implausible counter delta ignored')
      continue
    }

    const previous = totals.get(s.device.id)
    rows.push({
      deviceId: s.device.id,
      timestamp: at,
      uploadSpeed: round3(uploadMbps),
      downloadSpeed: round3(downloadMbps),
      uploadTotal: (BigInt(previous?.uploadTotal ?? '0') + dUp).toString(),
      downloadTotal: (BigInt(previous?.downloadTotal ?? '0') + dDown).toString(),
    })
    speeds.set(s.device.id, { uploadMbps: round3(uploadMbps), downloadMbps: round3(downloadMbps) })
  }

  await bandwidthRepo.insertMetrics(rows)
  return speeds
}

/** Forget counter baselines for devices that left, so a reconnect does not produce a bogus delta. */
export function forgetReading(macAddress: string): void {
  lastReading.delete(macAddress)
}

export function resetReadingsForTests(): void {
  lastReading.clear()
}

// ---- history --------------------------------------------------------------------------------

interface RawPoint {
  timestamp: Date
  uploadMbps: number
  downloadMbps: number
  uploadBytes: bigint
  downloadBytes: bigint
}

/** Average speeds and sum bytes into at most `max` evenly sized buckets. */
export function downsample(points: RawPoint[], from: Date, to: Date, max = MAX_POINTS): BandwidthPoint[] {
  const out = (p: RawPoint): BandwidthPoint => ({
    timestamp: p.timestamp,
    uploadMbps: round3(p.uploadMbps),
    downloadMbps: round3(p.downloadMbps),
    uploadBytes: p.uploadBytes.toString(),
    downloadBytes: p.downloadBytes.toString(),
  })
  if (points.length <= max) return points.map(out)
  const span = Math.max(1, to.getTime() - from.getTime())
  const width = span / max
  const buckets = new Map<number, { n: number; up: number; down: number; ub: bigint; db: bigint; ts: number }>()
  for (const p of points) {
    const idx = Math.min(max - 1, Math.floor((p.timestamp.getTime() - from.getTime()) / width))
    const b = buckets.get(idx) ?? { n: 0, up: 0, down: 0, ub: BigInt(0), db: BigInt(0), ts: from.getTime() + (idx + 1) * width }
    b.n++
    b.up += p.uploadMbps
    b.down += p.downloadMbps
    b.ub += p.uploadBytes
    b.db += p.downloadBytes
    buckets.set(idx, b)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, b]) =>
      out({ timestamp: new Date(Math.round(b.ts)), uploadMbps: b.up / b.n, downloadMbps: b.down / b.n, uploadBytes: b.ub, downloadBytes: b.db }),
    )
}

export async function getDeviceSeries(
  deviceId: string,
  range: BandwidthRange,
  resolution: BandwidthResolution,
  now: Date = new Date(),
): Promise<BandwidthPoint[]> {
  const from = new Date(now.getTime() - RANGE_MS[range])
  if (resolution === 'hourly') {
    const rows = await bandwidthRepo.hourlySeries(deviceId, from, now)
    return rows.map((r) => ({
      timestamp: r.hourStart,
      uploadMbps: round3(r.avgUploadSpeed),
      downloadMbps: round3(r.avgDownloadSpeed),
      uploadBytes: r.bytesUploaded,
      downloadBytes: r.bytesDownloaded,
    }))
  }
  const rows = await bandwidthRepo.rawSeries(deviceId, from, now)
  const points: RawPoint[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const prev = i > 0 ? rows[i - 1] : undefined
    const du = prev ? BigInt(r.uploadTotal) - BigInt(prev.uploadTotal) : BigInt(0)
    const dd = prev ? BigInt(r.downloadTotal) - BigInt(prev.downloadTotal) : BigInt(0)
    points.push({
      timestamp: r.timestamp,
      uploadMbps: r.uploadSpeed,
      downloadMbps: r.downloadSpeed,
      uploadBytes: du > BigInt(0) ? du : BigInt(0),
      downloadBytes: dd > BigInt(0) ? dd : BigInt(0),
    })
  }
  return downsample(points, from, now)
}

export async function getNetworkSeries(range: BandwidthRange, resolution: BandwidthResolution, now: Date = new Date()): Promise<BandwidthPoint[]> {
  const from = new Date(now.getTime() - RANGE_MS[range])
  if (resolution === 'hourly') {
    const rows = await bandwidthRepo.networkHourlySeries(from, now)
    return rows.map((r) => ({
      timestamp: r.hourStart,
      uploadMbps: round3(r.avgUploadSpeed),
      downloadMbps: round3(r.avgDownloadSpeed),
      uploadBytes: r.bytesUploaded,
      downloadBytes: r.bytesDownloaded,
    }))
  }
  const rows = await networkRepo.metricSeries(from, now)
  const points: RawPoint[] = rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1] : undefined
    const seconds = prev ? Math.max(0, (r.timestamp.getTime() - prev.timestamp.getTime()) / 1000) : 0
    return {
      timestamp: r.timestamp,
      uploadMbps: r.totalBandwidthUp,
      downloadMbps: r.totalBandwidthDown,
      // Network rows store rates; bytes are rate × interval.
      uploadBytes: BigInt(Math.round((r.totalBandwidthUp * 1e6 * seconds) / 8)),
      downloadBytes: BigInt(Math.round((r.totalBandwidthDown * 1e6 * seconds) / 8)),
    }
  })
  return downsample(points, from, now)
}

export interface CurrentThroughput {
  uploadMbps: number
  downloadMbps: number
  onlineDevices: number
  totalDevices: number
  unknownDevices: number
  peakTodayUploadMbps: number
  peakTodayDownloadMbps: number
  sampledAt: Date | null
}

export async function getCurrent(now: Date = new Date()): Promise<CurrentThroughput> {
  const { scanIntervalSeconds } = await getNetworkSettings()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [latest, counts, peak] = await Promise.all([networkRepo.latestMetric(), deviceRepo.counts(), networkRepo.peakSince(midnight)])
  const fresh = latest !== null && now.getTime() - latest.timestamp.getTime() <= Math.max(scanIntervalSeconds * 3, 90) * 1000
  return {
    uploadMbps: fresh && latest ? round3(latest.totalBandwidthUp) : 0,
    downloadMbps: fresh && latest ? round3(latest.totalBandwidthDown) : 0,
    onlineDevices: counts.online,
    totalDevices: counts.total,
    unknownDevices: counts.unknown,
    peakTodayUploadMbps: round3(peak.up),
    peakTodayDownloadMbps: round3(peak.down),
    sampledAt: latest?.timestamp ?? null,
  }
}

export interface TopConsumer {
  device: Device
  uploadBytes: string
  downloadBytes: string
  totalBytes: string
}

export async function getTopConsumers(range: BandwidthRange, limit: number, now: Date = new Date()): Promise<TopConsumer[]> {
  const from = new Date(now.getTime() - RANGE_MS[range])
  const bytes = await bytesByDevice(range, from)
  const ranked = [...bytes.entries()]
    .map(([deviceId, b]) => ({ deviceId, up: BigInt(b.up), down: BigInt(b.down) }))
    .filter((r) => r.up + r.down > BigInt(0))
    .sort((a, b) => (b.up + b.down > a.up + a.down ? 1 : b.up + b.down < a.up + a.down ? -1 : a.deviceId.localeCompare(b.deviceId)))
  const devices = new Map((await deviceRepo.findByIds(ranked.map((r) => r.deviceId))).map((d) => [d.id, d]))
  const out: TopConsumer[] = []
  for (const r of ranked) {
    const device = devices.get(r.deviceId)
    if (!device || device.isIgnored) continue
    out.push({ device, uploadBytes: r.up.toString(), downloadBytes: r.down.toString(), totalBytes: (r.up + r.down).toString() })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Bytes per device since `from`. Complete hours come from the rollup table; only the tail
 * since the last rolled hour is read from raw samples. Scanning 24h of raw rows directly
 * took ~1.4s on MySQL at 100 devices (docs/PERFORMANCE.md); this keeps it well under 1s.
 */
async function bytesByDevice(range: BandwidthRange, from: Date): Promise<Map<string, { up: string; down: string }>> {
  if (range === '1h') return bandwidthRepo.bytesByDeviceRaw(from)
  const lastRolled = await bandwidthRepo.latestHourlyStart()
  const rolledUntil = lastRolled ? new Date(lastRolled.getTime() + 3600_000) : null
  if (!rolledUntil || rolledUntil <= from) return bandwidthRepo.bytesByDeviceRaw(from)
  const [hourly, tail] = await Promise.all([bandwidthRepo.bytesByDeviceHourly(floorHour(from)), bandwidthRepo.bytesByDeviceRaw(rolledUntil)])
  const out = new Map(hourly)
  for (const [id, t] of tail) {
    const h = out.get(id)
    out.set(id, h ? { up: (BigInt(h.up) + BigInt(t.up)).toString(), down: (BigInt(h.down) + BigInt(t.down)).toString() } : t)
  }
  return out
}

export function topConsumerName(d: Device): string {
  return displayName(d)
}

// ---- rollup ---------------------------------------------------------------------------------

export function floorHour(d: Date): Date {
  const out = new Date(d)
  out.setUTCMinutes(0, 0, 0)
  return out
}

const MAX_ROLLUP_HOURS = 24 * 35

/**
 * Roll raw samples into bandwidth_hourly for every complete hour not yet rolled (plus the
 * last rolled hour again, in case late samples landed in it). Idempotent: the unique key on
 * (device_id, hour_start) makes a re-run an overwrite, never a double count.
 */
export async function rollupHourly(now: Date = new Date()): Promise<number> {
  const end = floorHour(now)
  const lastRolled = await bandwidthRepo.latestHourlyStart()
  const oldestRaw = await bandwidthRepo.oldestRawTimestamp()
  if (!oldestRaw) return 0
  let start = lastRolled ? new Date(lastRolled.getTime() - 3600_000) : floorHour(oldestRaw)
  if (start < floorHour(oldestRaw)) start = floorHour(oldestRaw)
  const earliestAllowed = new Date(end.getTime() - MAX_ROLLUP_HOURS * 3600_000)
  if (start < earliestAllowed) start = earliestAllowed

  let hours = 0
  for (let h = start.getTime(); h < end.getTime(); h += 3600_000) {
    const hourStart = new Date(h)
    const { rows, baseline } = await bandwidthRepo.rawWindowWithBaseline(hourStart, new Date(h + 3600_000))
    const byDevice = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = byDevice.get(r.deviceId) ?? []
      list.push(r)
      byDevice.set(r.deviceId, list)
    }
    const upserts: bandwidthRepo.HourlyUpsert[] = []
    for (const [deviceId, list] of byDevice) {
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) continue
      const base = baseline.get(deviceId) ?? first
      const bytesUp = BigInt(last.uploadTotal) - BigInt(base.uploadTotal)
      const bytesDown = BigInt(last.downloadTotal) - BigInt(base.downloadTotal)
      upserts.push({
        deviceId,
        hourStart,
        avgUploadSpeed: round3(list.reduce((s, r) => s + r.uploadSpeed, 0) / list.length),
        avgDownloadSpeed: round3(list.reduce((s, r) => s + r.downloadSpeed, 0) / list.length),
        peakUploadSpeed: round3(Math.max(...list.map((r) => r.uploadSpeed))),
        peakDownloadSpeed: round3(Math.max(...list.map((r) => r.downloadSpeed))),
        bytesUploaded: (bytesUp > BigInt(0) ? bytesUp : BigInt(0)).toString(),
        bytesDownloaded: (bytesDown > BigInt(0) ? bytesDown : BigInt(0)).toString(),
        sampleCount: list.length,
      })
    }
    await bandwidthRepo.upsertHourly(upserts)
    hours++
  }
  return hours
}
