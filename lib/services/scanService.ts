/**
 * One scan cycle: discover → upsert devices → bandwidth → connection events → alerts → metrics.
 * Called by the scheduler and by POST /api/devices/scan. A second concurrent call is refused
 * with CONFLICT rather than queued — two simultaneous ARP sweeps degrade each other.
 */
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import * as connectionRepo from '@/lib/db/repositories/connectionLogRepository'
import * as networkRepo from '@/lib/db/repositories/networkRepository'
import { AppError, conflict } from '@/lib/api/errors'
import type { Device, DeviceStatus } from '@/lib/types'
import { inferDeviceType } from '@/lib/utils/deviceType'
import { ipInCidr, isUnicastMac, normalizeMac } from '@/lib/utils/network'
import { logger } from '@/lib/utils/logger'
import * as alertService from './alertService'
import { forgetReading, recordSamples } from './bandwidthService'
import { IDLE_THRESHOLD_MBPS, markStaleDevicesOffline } from './deviceService'
import { publish } from './eventBus'
import { getScanner, invalidateScanner } from './scanners/registry'
import type { DiscoveredDevice } from './scanners/types'
import { getNetworkSettings } from './settingsService'
import { lookupVendor } from './vendorService'

export interface ScanResult {
  scanner: string
  durationMs: number
  devicesFound: number
  newDevices: number
  wentOffline: number
}

interface ScanState {
  running: boolean
  lastResult: (ScanResult & { at: Date }) | null
  lastError: { at: Date; message: string } | null
}

const g = globalThis as unknown as { __snmScanState?: ScanState }
const state: ScanState = g.__snmScanState ?? { running: false, lastResult: null, lastError: null }
g.__snmScanState = state

export function scanStatus(): Readonly<ScanState> {
  return state
}

export function isScanRunning(): boolean {
  return state.running
}

/** Normalise, de-duplicate, and drop anything outside the monitored subnet or in an ignored one. */
export function sanitize(found: DiscoveredDevice[], subnet: string, ignoreSubnets: string[], enforceSubnet: boolean): DiscoveredDevice[] {
  const byMac = new Map<string, DiscoveredDevice>()
  for (const d of found) {
    const mac = normalizeMac(d.macAddress)
    if (!mac || !isUnicastMac(mac)) continue
    if (enforceSubnet && !ipInCidr(d.ipAddress, subnet)) continue
    if (ignoreSubnets.some((s) => ipInCidr(d.ipAddress, s))) continue
    if (!byMac.has(mac)) byMac.set(mac, { ...d, macAddress: mac })
  }
  return [...byMac.values()]
}

export async function runScan(now: () => Date = () => new Date()): Promise<ScanResult> {
  if (state.running) throw conflict('A scan is already running.')
  state.running = true
  const started = Date.now()
  let scannerName = 'unknown'
  try {
    const settings = await getNetworkSettings()
    const scanner = await getScanner()
    scannerName = scanner.name

    let raw: DiscoveredDevice[]
    try {
      raw = await scanner.scan(settings.networkSubnet)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'scan failed'
      logger.error({ scanner: scanner.name, err: message }, 'scan failed; will re-select scanner next cycle')
      invalidateScanner()
      state.lastError = { at: now(), message }
      await networkRepo.insertScan({
        scannerName: scanner.name,
        scanDurationMs: Date.now() - started,
        deviceCount: 0,
        successCount: 0,
        failureCount: 1,
        status: 'failed',
        errorMessage: message.slice(0, 1000),
      })
      throw new AppError('SCANNER_UNAVAILABLE', 'The network scanner failed. It will be retried on the next cycle.')
    }

    // Router APIs can legitimately report clients on other LAN segments; ARP and simulated cannot.
    const discovered = sanitize(raw, settings.networkSubnet, settings.ignoreSubnets, scanner.name !== 'asus')
    const seenAt = now()
    const before = new Map((await deviceRepo.findAll()).map((d) => [d.macAddress, d]))

    for (const d of discovered) {
      const prev = before.get(d.macAddress)
      const manufacturer = prev?.manufacturer ?? lookupVendor(d.macAddress)
      const hostname = d.hostname ?? prev?.hostname ?? null
      await deviceRepo.upsertFromScan({
        macAddress: d.macAddress,
        ipAddress: d.ipAddress,
        hostname,
        manufacturer,
        signalStrength: d.signalStrength ?? null,
        status: prev?.status === 'idle' ? 'idle' : 'online',
        seenAt,
        ...(prev ? {} : { deviceType: inferDeviceType(hostname, manufacturer) }),
      })
    }

    const after = new Map((await deviceRepo.findAll()).map((d) => [d.macAddress, d]))
    const present: { device: Device; found: DiscoveredDevice }[] = []
    for (const d of discovered) {
      const device = after.get(d.macAddress)
      if (device) present.push({ device, found: d })
    }

    // Bandwidth: counters -> speeds + cumulative totals.
    const speeds = await recordSamples(
      present.map((p) => ({ device: p.device, uploadBytes: p.found.uploadBytes, downloadBytes: p.found.downloadBytes })),
      seenAt,
    )

    // Online vs idle, only where traffic is measurable.
    for (const { device } of present) {
      const speed = speeds.get(device.id)
      const next: DeviceStatus = speed && speed.uploadMbps + speed.downloadMbps < IDLE_THRESHOLD_MBPS ? 'idle' : 'online'
      if (device.status !== next) await deviceRepo.updateStatus(device.id, next)
    }

    // Connection events.
    let newDevices = 0
    for (const { device } of present) {
      const prev = before.get(device.macAddress)
      if (!prev) {
        newDevices++
        await connectionRepo.logConnection(device.id, device.ipAddress, seenAt)
        publish('device.connected', { deviceId: device.id, macAddress: device.macAddress, isNew: true })
        await alertService.onNewDevice(device)
      } else if (prev.status === 'offline') {
        await connectionRepo.logConnection(device.id, device.ipAddress, seenAt)
        publish('device.connected', { deviceId: device.id, macAddress: device.macAddress, isNew: false })
      }
    }

    const offline = await markStaleDevicesOffline(settings.scanIntervalSeconds, seenAt)
    for (const { device } of offline) {
      forgetReading(device.macAddress)
      publish('device.disconnected', { deviceId: device.id, macAddress: device.macAddress })
      await alertService.onDeviceOffline(device)
    }

    for (const { device } of present) {
      const speed = speeds.get(device.id)
      if (speed) await alertService.onBandwidthSample(device, speed.uploadMbps, speed.downloadMbps)
    }

    // Network-wide sample.
    let up = 0
    let down = 0
    for (const s of speeds.values()) {
      up += s.uploadMbps
      down += s.downloadMbps
    }
    const counts = await deviceRepo.counts()
    const peak = [...speeds.values()].reduce((p, s) => ({ up: Math.max(p.up, s.uploadMbps), down: Math.max(p.down, s.downloadMbps) }), { up: 0, down: 0 })
    // A scan whose counters were all baselines (first after start) has no speeds to report yet;
    // writing zeros would draw a false dip in the network chart.
    const baselineOnly = speeds.size === 0 && discovered.some((d) => d.uploadBytes !== undefined)
    if (!baselineOnly && discovered.length > 0) {
      await networkRepo.insertMetric({
        timestamp: seenAt,
        totalBandwidthUp: Math.round(up * 1000) / 1000,
        totalBandwidthDown: Math.round(down * 1000) / 1000,
        activeDevices: discovered.length,
        onlineDevices: counts.online,
        peakBandwidthUp: peak.up,
        peakBandwidthDown: peak.down,
      })
    }
    publish('bandwidth.tick', { uploadMbps: Math.round(up * 100) / 100, downloadMbps: Math.round(down * 100) / 100, onlineDevices: counts.online })

    const result: ScanResult = {
      scanner: scanner.name,
      durationMs: Date.now() - started,
      devicesFound: discovered.length,
      newDevices,
      wentOffline: offline.length,
    }
    await networkRepo.insertScan({
      scannerName: scanner.name,
      scanDurationMs: result.durationMs,
      deviceCount: discovered.length,
      successCount: discovered.length,
      failureCount: 0,
      status: 'success',
      errorMessage: null,
    })
    state.lastResult = { ...result, at: seenAt }
    state.lastError = null
    publish('scan.completed', { ...result })
    logger.debug({ ...result }, 'scan complete')
    return result
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error({ scanner: scannerName, err: err instanceof Error ? err.stack : String(err) }, 'scan cycle crashed')
      state.lastError = { at: now(), message: err instanceof Error ? err.message : 'scan crashed' }
    }
    throw err
  } finally {
    state.running = false
  }
}
