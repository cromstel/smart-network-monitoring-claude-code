import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db/schema'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import * as connectionRepo from '@/lib/db/repositories/connectionLogRepository'
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import { resetReadingsForTests } from '@/lib/services/bandwidthService'
import { runScan } from '@/lib/services/scanService'
import { setScannerForTests } from '@/lib/services/scanners/registry'
import type { DiscoveredDevice, Scanner } from '@/lib/services/scanners/types'
import { DIALECTS, createTestDb, createUser, destroyTestDb, truncateAll } from '../helpers/db'

class FakeScanner implements Scanner {
  readonly name = 'simulated' as const
  devices: DiscoveredDevice[] = []
  fail = false
  async isAvailable() {
    return true
  }
  async scan() {
    if (this.fail) throw new Error('boom')
    return this.devices
  }
}

const PHONE: DiscoveredDevice = { macAddress: 'a4:83:e7:2c:11:09', ipAddress: '192.168.1.42', hostname: 'anas-iphone' }
const OUTSIDE: DiscoveredDevice = { macAddress: 'A4:83:E7:2C:11:0A', ipAddress: '10.9.9.9' }
const BROADCAST: DiscoveredDevice = { macAddress: 'FF:FF:FF:FF:FF:FF', ipAddress: '192.168.1.255' }

describe.each(DIALECTS)('scan cycle [%s]', (client) => {
  let db: Kysely<DB>
  const scanner = new FakeScanner()
  let t = new Date('2026-09-24T10:00:00Z').getTime()
  const clock = () => new Date(t)

  beforeAll(async () => {
    db = await createTestDb(client)
    setScannerForTests(scanner)
  })
  beforeEach(() => {
    resetReadingsForTests()
    scanner.fail = false
    t = new Date('2026-09-24T10:00:00Z').getTime()
  })
  afterEach(async () => {
    await truncateAll(db)
  })
  afterAll(async () => {
    setScannerForTests(null)
    await destroyTestDb()
  })

  it('discovers, normalises, filters, resolves vendor and alerts exactly once (F-05, F-30)', async () => {
    const admin = await createUser('ana', 'ADMIN', { notifyNewDevices: true })
    scanner.devices = [PHONE, OUTSIDE, BROADCAST, PHONE]

    const first = await runScan(clock)
    expect(first).toMatchObject({ devicesFound: 1, newDevices: 1, wentOffline: 0 })
    const device = await deviceRepo.findByMac('A4:83:E7:2C:11:09')
    expect(device).toMatchObject({ ipAddress: '192.168.1.42', manufacturer: 'Apple, Inc.', deviceType: 'phone', status: 'online' })

    t += 30_000
    const second = await runScan(clock)
    expect(second.newDevices).toBe(0)

    const notes = await notificationRepo.listForUser(admin.id, { limit: 10, offset: 0 })
    expect(notes.notifications).toHaveLength(1)
    expect(notes.notifications[0]?.title).toBe('Unknown device connected')
  })

  it('turns counters into speeds and cumulative totals, surviving a counter reset', async () => {
    scanner.devices = [{ ...PHONE, uploadBytes: '1000000', downloadBytes: '10000000' }]
    await runScan(clock) // baseline
    t += 10_000
    scanner.devices = [{ ...PHONE, uploadBytes: '2250000', downloadBytes: '22500000' }]
    await runScan(clock)
    const device = await deviceRepo.findByMac(PHONE.macAddress)
    if (!device) throw new Error('missing')
    const { rows } = await import('@/lib/db/repositories/bandwidthRepository').then((m) => m.rawWindowWithBaseline(new Date(0), new Date(t + 1)))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ uploadSpeed: 1, downloadSpeed: 10, uploadTotal: '1250000', downloadTotal: '12500000' })

    t += 10_000
    scanner.devices = [{ ...PHONE, uploadBytes: '500000', downloadBytes: '5000000' }] // router rebooted
    await runScan(clock)
    const after = await import('@/lib/db/repositories/bandwidthRepository').then((m) => m.latestForDevices([device.id]))
    expect(after.get(device.id)?.downloadTotal).toBe('17500000') // monotonic
  })

  it('marks a device offline after it stops answering, logging session length (F-06)', async () => {
    const admin = await createUser('ana', 'ADMIN', { notifyDeviceOffline: true })
    scanner.devices = [PHONE]
    await runScan(clock)
    const device = await deviceRepo.findByMac(PHONE.macAddress)
    if (!device) throw new Error('missing')
    await deviceRepo.updateMetadata(device.id, { deviceName: "Ana's iPhone" })

    scanner.devices = []
    t += 60_000
    expect((await runScan(clock)).wentOffline).toBe(0) // one missed scan is not enough
    t += 90_000
    expect((await runScan(clock)).wentOffline).toBe(1)

    const offline = await deviceRepo.findById(device.id)
    expect(offline?.status).toBe('offline')
    const logs = await connectionRepo.recentForDevice(device.id)
    expect(logs.map((l) => l.eventType)).toEqual(['disconnected', 'connected'])
    expect(offline?.totalConnectionTimeSeconds).toBe(0) // last seen at the first scan: zero-length session

    const titles = (await notificationRepo.listForUser(admin.id, { limit: 10, offset: 0 })).notifications.map((n) => n.title)
    expect(titles).toContain("Ana's iPhone went offline")

    scanner.devices = [PHONE]
    t += 30_000
    await runScan(clock)
    expect((await deviceRepo.findById(device.id))?.status).toBe('online')
    expect((await connectionRepo.recentForDevice(device.id)).map((l) => l.eventType)).toEqual(['connected', 'disconnected', 'connected'])
  })

  it('a scanner failure is recorded, surfaces as SCANNER_UNAVAILABLE, and marks nothing offline', async () => {
    scanner.devices = [PHONE]
    await runScan(clock)
    scanner.fail = true
    t += 600_000
    await expect(runScan(clock)).rejects.toMatchObject({ code: 'SCANNER_UNAVAILABLE' })
    expect((await deviceRepo.findByMac(PHONE.macAddress))?.status).toBe('online')
    const history = await db.selectFrom('network_scan_history').select('status').execute()
    expect(history.map((h) => h.status).sort()).toEqual(['failed', 'success'])
    setScannerForTests(scanner) // failure invalidated the registry; reinstall
  })

  it('refuses a concurrent scan with CONFLICT', async () => {
    scanner.devices = [PHONE]
    const [a, b] = await Promise.allSettled([runScan(clock), runScan(clock)])
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT' })
  })
})
