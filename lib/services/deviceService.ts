import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import * as bandwidthRepo from '@/lib/db/repositories/bandwidthRepository'
import * as connectionRepo from '@/lib/db/repositories/connectionLogRepository'
import * as categoryRepo from '@/lib/db/repositories/categoryRepository'
import { AppError, notFound } from '@/lib/api/errors'
import type { ConnectionLog, Device, DeviceCategory, DeviceStatus, DeviceType } from '@/lib/types'
import { publish } from './eventBus'
import { getNetworkSettings } from './settingsService'

/** A device is marked offline after this many consecutive missed scans (PRD F-06)… */
export const MISSED_SCANS_BEFORE_OFFLINE = 2
/** …but never sooner than this, however short the interval. */
export const MIN_OFFLINE_AFTER_SECONDS = 120
/** Below this combined throughput a present device is shown as idle. */
export const IDLE_THRESHOLD_MBPS = 0.05

export interface DeviceView extends Device {
  currentBandwidth: { uploadMbps: number; downloadMbps: number } | null
  totalTransferred: { uploadBytes: string; downloadBytes: string }
  isUnknown: boolean
}

export interface DeviceDetail extends DeviceView {
  category: DeviceCategory | null
  connectionLogs: ConnectionLog[]
  stats: { peakUploadMbps: number; peakDownloadMbps: number; averageSessionSeconds: number | null; sessionCount: number }
}

export function offlineCutoff(scanIntervalSeconds: number, now: Date): Date {
  const seconds = Math.max(scanIntervalSeconds * MISSED_SCANS_BEFORE_OFFLINE, MIN_OFFLINE_AFTER_SECONDS)
  return new Date(now.getTime() - seconds * 1000)
}

/** Attach live bandwidth, cumulative bytes, and the running session to the stored connection time. */
export async function enrich(devices: Device[], now: Date = new Date()): Promise<DeviceView[]> {
  if (devices.length === 0) return []
  const ids = devices.map((d) => d.id)
  const { scanIntervalSeconds } = await getNetworkSettings()
  const freshAfter = new Date(now.getTime() - Math.max(scanIntervalSeconds * 3, 90) * 1000)
  const [latest, sessionStarts] = await Promise.all([
    bandwidthRepo.latestForDevices(ids),
    connectionRepo.latestConnectedAt(ids.filter((id) => devices.find((d) => d.id === id)?.status !== 'offline')),
  ])
  return devices.map((d) => {
    const metric = latest.get(d.id)
    const present = d.status !== 'offline'
    const fresh = present && metric !== undefined && metric.timestamp >= freshAfter
    const sessionStart = sessionStarts.get(d.id)
    const running = present && sessionStart ? Math.max(0, (now.getTime() - sessionStart.getTime()) / 1000) : 0
    return {
      ...d,
      totalConnectionTimeSeconds: Math.round(d.totalConnectionTimeSeconds + running),
      currentBandwidth: fresh && metric ? { uploadMbps: round2(metric.uploadSpeed), downloadMbps: round2(metric.downloadSpeed) } : null,
      totalTransferred: { uploadBytes: metric?.uploadTotal ?? '0', downloadBytes: metric?.downloadTotal ?? '0' },
      isUnknown: d.deviceName === null,
    }
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ListDevicesInput {
  status?: DeviceStatus
  type?: string
  search?: string
  categoryId?: string
  includeIgnored?: boolean
  sort: 'name' | 'lastSeen' | 'bandwidth'
  order?: 'asc' | 'desc'
  page: number
  pageSize: number
}

export async function listDevices(input: ListDevicesInput): Promise<{ devices: DeviceView[]; total: number }> {
  const offset = (input.page - 1) * input.pageSize
  const base = {
    status: input.status,
    type: input.type,
    search: input.search,
    categoryId: input.categoryId,
    includeIgnored: input.includeIgnored,
  }
  if (input.sort !== 'bandwidth') {
    const { devices, total } = await deviceRepo.list({ ...base, sort: input.sort, order: input.order, limit: input.pageSize, offset })
    return { devices: await enrich(devices), total }
  }
  // Bandwidth is a live, derived value: rank the filtered set, then page it.
  const { devices, total } = await deviceRepo.list({ ...base, sort: 'lastSeen' })
  const enriched = await enrich(devices)
  const direction = input.order === 'asc' ? 1 : -1
  const rate = (d: DeviceView) => (d.currentBandwidth ? d.currentBandwidth.downloadMbps + d.currentBandwidth.uploadMbps : -1)
  enriched.sort((a, b) => direction * (rate(a) - rate(b)) || a.id.localeCompare(b.id))
  return { devices: enriched.slice(offset, offset + input.pageSize), total }
}

export async function getDevice(id: string): Promise<DeviceDetail> {
  const device = await deviceRepo.findById(id)
  if (!device) throw notFound('Device')
  const since = new Date(Date.now() - 30 * 86400_000)
  const [[view], category, logs, sessions, peak] = await Promise.all([
    enrich([device]),
    device.categoryId ? categoryRepo.findById(device.categoryId) : Promise.resolve(null),
    connectionRepo.recentForDevice(id, 20),
    connectionRepo.sessionStats(id),
    bandwidthRepo.peakForDevice(id, since),
  ])
  if (!view) throw notFound('Device')
  return {
    ...view,
    category,
    connectionLogs: logs,
    stats: {
      peakUploadMbps: round2(peak.up),
      peakDownloadMbps: round2(peak.down),
      averageSessionSeconds: sessions.averageSessionSeconds === null ? null : Math.round(sessions.averageSessionSeconds),
      sessionCount: sessions.sessionCount,
    },
  }
}

export interface DevicePatch {
  deviceName?: string | null
  deviceType?: DeviceType
  categoryId?: string | null
  isIgnored?: boolean
}

export async function updateDevice(id: string, patch: DevicePatch): Promise<DeviceView> {
  const existing = await deviceRepo.findById(id)
  if (!existing) throw notFound('Device')
  if (patch.categoryId) {
    const category = await categoryRepo.findById(patch.categoryId)
    if (!category) throw new AppError('INVALID_BODY', 'Category does not exist.', { fieldErrors: { categoryId: ['Unknown category'] } })
  }
  const name = patch.deviceName === undefined ? undefined : patch.deviceName?.trim() || null
  const updated = await deviceRepo.updateMetadata(id, { ...patch, deviceName: name })
  if (!updated) throw notFound('Device')
  publish('device.updated', { deviceId: id })
  const [view] = await enrich([updated])
  if (!view) throw notFound('Device')
  return view
}

export async function deleteDevice(id: string): Promise<void> {
  const deleted = await deviceRepo.deleteById(id)
  if (!deleted) throw notFound('Device')
  publish('device.updated', { deviceId: id, deleted: true })
}

export interface WentOffline {
  device: Device
  sessionSeconds: number | null
}

/**
 * The one definition of "offline". Logs a disconnection with the session length and adds it
 * to the device's cumulative connection time (PRD F-12).
 */
export async function markStaleDevicesOffline(scanIntervalSeconds: number, now: Date = new Date()): Promise<WentOffline[]> {
  const stale = await deviceRepo.findOnlineLastSeenBefore(offlineCutoff(scanIntervalSeconds, now))
  if (stale.length === 0) return []
  const starts = await connectionRepo.latestConnectedAt(stale.map((d) => d.id))
  const out: WentOffline[] = []
  for (const device of stale) {
    const start = starts.get(device.id)
    // The session ended when the device was last seen, not when we noticed.
    const sessionSeconds = start ? Math.max(0, (device.lastSeen.getTime() - start.getTime()) / 1000) : null
    await deviceRepo.updateStatus(device.id, 'offline')
    await connectionRepo.logDisconnection(device.id, device.ipAddress, device.lastSeen, sessionSeconds)
    if (sessionSeconds) await deviceRepo.addConnectionTime(device.id, sessionSeconds)
    out.push({ device: { ...device, status: 'offline' }, sessionSeconds })
  }
  return out
}

export async function listCategories(): Promise<DeviceCategory[]> {
  return categoryRepo.list()
}

export async function deviceCounts() {
  return deviceRepo.counts()
}
