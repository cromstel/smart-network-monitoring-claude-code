import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db/schema'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import * as bandwidthRepo from '@/lib/db/repositories/bandwidthRepository'
import * as routerRepo from '@/lib/db/repositories/routerRepository'
import { DIALECTS, createTestDb, destroyTestDb, truncateAll } from '../helpers/db'

const base = { hostname: null, manufacturer: null, signalStrength: null, status: 'online' as const, seenAt: new Date('2026-09-24T10:00:00Z') }

describe.each(DIALECTS)('repositories [%s]', (client) => {
  let db: Kysely<DB>
  beforeAll(async () => {
    db = await createTestDb(client)
  })
  afterEach(async () => {
    await truncateAll(db)
  })
  afterAll(async () => {
    await destroyTestDb()
  })

  it('upserts on MAC conflict rather than duplicating — lowercase input included', async () => {
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'A4:83:E7:2C:11:09', ipAddress: '192.168.1.42' })
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'a4:83:e7:2c:11:09', ipAddress: '192.168.1.99', hostname: 'phone' })
    const all = await deviceRepo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.ipAddress).toBe('192.168.1.99')
    expect(all[0]?.hostname).toBe('phone')
  })

  it('keeps an existing hostname when a scan has none', async () => {
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'AA:00:00:00:00:01', ipAddress: '192.168.1.2', hostname: 'nas' })
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'AA:00:00:00:00:01', ipAddress: '192.168.1.2' })
    expect((await deviceRepo.findByMac('aa:00:00:00:00:01'))?.hostname).toBe('nas')
  })

  it('searches name/hostname/IP/MAC/vendor case-insensitively, treating % and _ literally', async () => {
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'AA:00:00:00:00:01', ipAddress: '192.168.1.2', hostname: 'Living_Room-TV' })
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'AA:00:00:00:00:02', ipAddress: '192.168.1.3', hostname: 'LivingXRoom' })
    expect((await deviceRepo.list({ search: 'living_room' })).devices.map((d) => d.hostname)).toEqual(['Living_Room-TV'])
    expect((await deviceRepo.list({ search: 'aa:00:00:00:00:02' })).total).toBe(1)
    expect((await deviceRepo.list({ search: '100%' })).total).toBe(0)
  })

  it('filters, sorts and paginates', async () => {
    for (let i = 1; i <= 7; i++) {
      await deviceRepo.upsertFromScan({ ...base, macAddress: `AA:00:00:00:00:0${i}`, ipAddress: `192.168.1.${i}`, hostname: `host-${8 - i}`, status: i % 2 ? 'online' : 'offline' })
    }
    const page = await deviceRepo.list({ sort: 'name', order: 'asc', limit: 3, offset: 3 })
    expect(page.total).toBe(7)
    expect(page.devices.map((d) => d.hostname)).toEqual(['host-4', 'host-5', 'host-6'])
    expect((await deviceRepo.list({ status: 'offline' })).total).toBe(3)
    const counts = await deviceRepo.counts()
    expect(counts).toEqual({ total: 7, online: 4, unknown: 7 })
  })

  it('round-trips byte counters beyond Number.MAX_SAFE_INTEGER as exact strings (A-05)', async () => {
    await deviceRepo.upsertFromScan({ ...base, macAddress: 'AA:00:00:00:00:01', ipAddress: '192.168.1.2' })
    const device = await deviceRepo.findByMac('AA:00:00:00:00:01')
    if (!device) throw new Error('missing device')
    // SQLite INTEGER is a JS number through better-sqlite3, so it is exact only to 2^53; MySQL is exact to 2^63.
    const huge = client === 'mysql' ? '9007199254740993123' : '9007199254740991'
    await bandwidthRepo.insertMetrics([{ deviceId: device.id, timestamp: new Date(), uploadSpeed: 1, downloadSpeed: 2, uploadTotal: huge, downloadTotal: '1' }])
    const latest = (await bandwidthRepo.latestForDevices([device.id])).get(device.id)
    expect(latest?.uploadTotal).toBe(huge)
    expect(typeof latest?.uploadTotal).toBe('string')
  })

  it('never selects the router password outside the credentials function', async () => {
    await routerRepo.save({ routerType: 'asus', routerName: null, routerIp: '192.168.1.1', port: 80, username: 'admin', passwordEncrypted: 'aa:bb:cc' })
    const config = await routerRepo.find()
    expect(JSON.stringify(config)).not.toContain('aa:bb:cc')
    expect(config).not.toHaveProperty('password')
    expect(config).not.toHaveProperty('passwordEncrypted')
    expect((await routerRepo.findEncryptedCredentials())?.passwordEncrypted).toBe('aa:bb:cc')
  })
})
