import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db/schema'
import { toDbTime } from '@/lib/db/time'
import * as categoryRepo from '@/lib/db/repositories/categoryRepository'
import * as networkRepo from '@/lib/db/repositories/networkRepository'
import { getCurrent, getDeviceSeries, getNetworkSeries, getTopConsumers } from '@/lib/services/bandwidthService'
import { getDevice, listCategories, listDevices, updateDevice } from '@/lib/services/deviceService'
import { getStatus, saveConfig, setBlocked, testConnection, loadCredentials, resetStatusCacheForTests } from '@/lib/services/routerService'
import { DIALECTS, createTestDb, destroyTestDb, insertDevice, truncateAll } from '../helpers/db'

describe.each(DIALECTS)('bandwidth and device queries [%s]', (client) => {
  let db: Kysely<DB>
  const now = new Date()
  let a: string
  let b: string

  beforeAll(async () => {
    db = await createTestDb(client)
  })
  beforeEach(async () => {
    a = await insertDevice(db, { mac: 'AA:00:00:00:00:01', ip: '192.168.1.10', name: 'Laptop' })
    b = await insertDevice(db, { mac: 'AA:00:00:00:00:02', ip: '192.168.1.11' })
    const rows = []
    for (let i = 0; i < 60; i++) {
      const at = toDbTime(new Date(now.getTime() - (60 - i) * 60_000))
      rows.push({ id: randomUUID(), device_id: a, timestamp: at, upload_speed: 1, download_speed: 10, upload_total: 1000 * i, download_total: 10_000 * i, created_at: at })
      rows.push({ id: randomUUID(), device_id: b, timestamp: at, upload_speed: 0.5, download_speed: 2, upload_total: 100 * i, download_total: 1000 * i, created_at: at })
    }
    await db.insertInto('bandwidth_metrics').values(rows).execute()
    const hourAt = toDbTime(new Date(now.getTime() - 3 * 86400_000))
    await db
      .insertInto('bandwidth_hourly')
      .values([
        { id: randomUUID(), device_id: a, hour_start: hourAt, avg_upload_speed: 2, avg_download_speed: 20, peak_upload_speed: 5, peak_download_speed: 95, bytes_uploaded: '7000', bytes_downloaded: '70000', sample_count: 120, created_at: hourAt },
        { id: randomUUID(), device_id: b, hour_start: hourAt, avg_upload_speed: 1, avg_download_speed: 4, peak_upload_speed: 2, peak_download_speed: 8, bytes_uploaded: '9000000', bytes_downloaded: '0', sample_count: 120, created_at: hourAt },
      ])
      .execute()
    await networkRepo.insertMetric({ timestamp: new Date(now.getTime() - 60_000), totalBandwidthUp: 1.5, totalBandwidthDown: 12, activeDevices: 2, onlineDevices: 2, peakBandwidthUp: 1, peakBandwidthDown: 10 })
    await networkRepo.insertMetric({ timestamp: now, totalBandwidthUp: 1.5, totalBandwidthDown: 12, activeDevices: 2, onlineDevices: 2, peakBandwidthUp: 1, peakBandwidthDown: 10 })
  })
  afterEach(async () => {
    await truncateAll(db)
  })
  afterAll(async () => {
    await destroyTestDb()
  })

  it('per-device raw series has per-interval byte deltas', async () => {
    const points = await getDeviceSeries(a, '1h', 'raw', now)
    expect(points.length).toBeGreaterThan(50)
    expect(points[1]).toMatchObject({ downloadMbps: 10, downloadBytes: '10000', uploadBytes: '1000' })
  })

  it('per-device hourly series reads aggregates', async () => {
    const points = await getDeviceSeries(a, '7d', 'hourly', now)
    expect(points).toEqual([expect.objectContaining({ downloadMbps: 20, downloadBytes: '70000' })])
  })

  it('network series in both resolutions', async () => {
    const raw = await getNetworkSeries('1h', 'raw', now)
    expect(raw).toHaveLength(2)
    expect(raw[1]?.downloadBytes).toBe(String((12 * 1e6 * 60) / 8))
    const hourly = await getNetworkSeries('7d', 'hourly', now)
    expect(hourly[0]).toMatchObject({ downloadMbps: 24, uploadBytes: '9007000' })
  })

  it('ranks top consumers from raw (24h) and hourly (7d) data', async () => {
    const day = await getTopConsumers('24h', 5, now)
    expect(day.map((t) => t.device.id)).toEqual([a, b])
    expect(day[0]?.downloadBytes).toBe(String(10_000 * 59))
    const week = await getTopConsumers('7d', 1, now)
    expect(week.map((t) => t.device.id)).toEqual([b]) // 9 MB up beats 77 KB
  })

  it('24h ranking combines rolled-up hours with the raw tail since the last rollup', async () => {
    const hour = new Date(now.getTime() - 5 * 3600_000)
    hour.setUTCMinutes(0, 0, 0)
    const at = toDbTime(hour)
    await db
      .insertInto('bandwidth_hourly')
      .values({ id: randomUUID(), device_id: b, hour_start: at, avg_upload_speed: 1, avg_download_speed: 1, peak_upload_speed: 1, peak_download_speed: 1, bytes_uploaded: '50000000', bytes_downloaded: '0', sample_count: 120, created_at: at })
      .execute()
    const day = await getTopConsumers('24h', 5, now)
    expect(day.map((t) => t.device.id)).toEqual([b, a])
    expect(day[0]?.uploadBytes).toBe(String(50_000_000 + 100 * 59)) // hourly + raw tail
  })

  it('current throughput, counts and peak today', async () => {
    const c = await getCurrent(now)
    expect(c).toMatchObject({ downloadMbps: 12, uploadMbps: 1.5, totalDevices: 2, onlineDevices: 2, unknownDevices: 1 })
  })

  it('device list sorted by live bandwidth, and detail with stats', async () => {
    const byRate = await listDevices({ sort: 'bandwidth', order: 'desc', page: 1, pageSize: 10 })
    expect(byRate.devices.map((d) => d.id)).toEqual([a, b])
    expect(byRate.devices[0]?.currentBandwidth).toEqual({ uploadMbps: 1, downloadMbps: 10 })
    const detail = await getDevice(a)
    expect(detail.stats.peakDownloadMbps).toBe(95)
    await expect(getDevice(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('recategorises a device; an unknown category is a 400', async () => {
    const cat = await categoryRepo.create({ name: 'Work', color: '#fbbf24', icon: null, description: null })
    expect((await listCategories()).map((c) => c.name)).toEqual(['Work'])
    const updated = await updateDevice(b, { categoryId: cat.id, deviceName: '  ' })
    expect(updated).toMatchObject({ categoryId: cat.id, deviceName: null })
    await expect(updateDevice(b, { categoryId: randomUUID() })).rejects.toMatchObject({ code: 'INVALID_BODY' })
  })

  it('router service: encrypts, decrypts only at use, degrades when unreachable, refuses block', async () => {
    resetStatusCacheForTests()
    expect((await getStatus()).configured).toBe(false)
    await expect(saveConfig({ routerType: 'generic', routerIp: '127.0.0.1', port: 9, username: 'admin' })).rejects.toMatchObject({ code: 'INVALID_BODY' })
    await saveConfig({ routerType: 'generic', routerIp: '127.0.0.1', port: 9, username: 'admin', password: 'p@ss' })
    expect((await loadCredentials())?.password).toBe('p@ss')
    const test = await testConnection()
    expect(test.reachable).toBe(false)
    const status = await getStatus()
    expect(status).toMatchObject({ configured: true, reachable: false })
    await expect(setBlocked(a, true)).rejects.toMatchObject({ code: 'ROUTER_UNSUPPORTED' })
    await expect(setBlocked(randomUUID(), true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // updating without a password keeps the stored one
    await saveConfig({ routerType: 'generic', routerIp: '127.0.0.1', port: 10, username: 'root' })
    expect((await loadCredentials())?.password).toBe('p@ss')
  }, 20_000)
})
