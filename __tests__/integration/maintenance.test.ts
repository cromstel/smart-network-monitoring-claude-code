import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db/schema'
import { toDbTime } from '@/lib/db/time'
import { rollupHourly } from '@/lib/services/bandwidthService'
import { pruneRetention } from '@/lib/services/maintenanceService'
import { DIALECTS, createTestDb, createUser, destroyTestDb, insertDevice, sessionTokenFor, truncateAll } from '../helpers/db'

const NOW = new Date('2026-09-24T12:30:00Z')

async function metric(db: Kysely<DB>, deviceId: string, at: Date, down: number, total: number) {
  await db
    .insertInto('bandwidth_metrics')
    .values({ id: randomUUID(), device_id: deviceId, timestamp: toDbTime(at), upload_speed: 1, download_speed: down, upload_total: total, download_total: total * 10, created_at: toDbTime(at) })
    .execute()
}

describe.each(DIALECTS)('maintenance jobs [%s]', (client) => {
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

  it('rolls raw samples into hourly aggregates, idempotently (B-24)', async () => {
    const deviceId = await insertDevice(db)
    const h10 = new Date('2026-09-24T10:00:00Z').getTime()
    await metric(db, deviceId, new Date(h10 - 60_000), 0, 1000) // baseline before the hour
    await metric(db, deviceId, new Date(h10 + 60_000), 10, 1500)
    await metric(db, deviceId, new Date(h10 + 120_000), 30, 4000)
    await metric(db, deviceId, new Date(h10 + 3600_000 + 60_000), 20, 5000)

    await rollupHourly(NOW)
    const once = await db.selectFrom('bandwidth_hourly').selectAll().orderBy('hour_start').execute()
    await rollupHourly(NOW)
    await rollupHourly(NOW)
    const thrice = await db.selectFrom('bandwidth_hourly').selectAll().orderBy('hour_start').execute()

    expect(thrice).toHaveLength(once.length)
    const ten = thrice.find((r) => String(r.hour_start).startsWith('2026-09-24 10:00'))
    expect(ten).toBeDefined()
    expect(Number(ten?.avg_download_speed)).toBe(20)
    expect(Number(ten?.peak_download_speed)).toBe(30)
    expect(String(ten?.bytes_uploaded)).toBe('3000') // 4000 - baseline 1000
    expect(Number(ten?.sample_count)).toBe(2)
    const eleven = thrice.find((r) => String(r.hour_start).startsWith('2026-09-24 11:00'))
    expect(String(eleven?.bytes_uploaded)).toBe('1000')
  })

  it('prunes rows past retention in batches, keeps recent ones, and clears expired sessions (F-51)', async () => {
    const now = new Date() // sessions expire on the real clock
    const deviceId = await insertDevice(db)
    const user = await createUser('ana')
    const old = new Date(now.getTime() - 40 * 86400_000)
    const recent = new Date(now.getTime() - 86400_000)
    for (let i = 0; i < 25; i++) await metric(db, deviceId, new Date(old.getTime() + i * 1000), 1, i)
    await metric(db, deviceId, recent, 1, 100)
    await db.insertInto('connection_logs').values({ id: randomUUID(), device_id: deviceId, event_type: 'connected', timestamp: toDbTime(old), ip_address: null, connection_duration: null, created_at: toDbTime(old) }).execute()
    await db.insertInto('notifications').values({ id: randomUUID(), user_id: user.id, device_id: null, alert_id: null, title: 'old', message: 'old', is_read: 0, data: null, created_at: toDbTime(old) }).execute()
    await db.insertInto('network_scan_history').values({ id: randomUUID(), scanner_name: 'arp', scan_duration: 1, status: 'success', error_message: null, created_at: toDbTime(new Date(now.getTime() - 8 * 86400_000)) }).execute()
    await sessionTokenFor(user, -1000) // already expired

    const result = await pruneRetention(now, 10) // batch of 10 exercises the loop

    expect(result).toMatchObject({ retentionDays: 30, bandwidthMetrics: 25, connectionLogs: 1, notifications: 1, scanHistory: 1, sessions: 1 })
    const left = await db.selectFrom('bandwidth_metrics').select('id').execute()
    expect(left).toHaveLength(1)
  })
})
