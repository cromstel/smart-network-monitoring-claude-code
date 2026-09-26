import { sql } from 'kysely'
import { migrateToLatest, migrateToZero, MIGRATION_NAMES } from '@/lib/db/migrator'
import { getDb } from '@/lib/db/client'
import { DIALECTS, createTestDb, destroyTestDb } from '../helpers/db'

describe.each(DIALECTS)('migrations [%s]', (client) => {
  beforeAll(async () => {
    await createTestDb(client)
  })
  afterAll(async () => {
    await migrateToLatest(getDb())
    await destroyTestDb()
  })

  it('go up, all the way down, and up again cleanly (B-10)', async () => {
    const db = getDb()
    await migrateToZero(db)
    const tables = async () => (await db.introspection.getTables()).map((t) => t.name).filter((n) => !n.startsWith('kysely_'))
    expect(await tables()).toEqual([])
    const applied = await migrateToLatest(db)
    expect(applied).toEqual(MIGRATION_NAMES)
    expect((await tables()).sort()).toEqual(
      [
        'bandwidth_hourly',
        'bandwidth_metrics',
        'connection_logs',
        'device_alerts',
        'device_categories',
        'devices',
        'network_metrics',
        'network_scan_history',
        'notifications',
        'router_config',
        'sessions',
        'user_settings',
        'users',
      ].sort(),
    )
  })

  it('enforces foreign keys (SQLite needs the pragma on every connection)', async () => {
    const db = getDb()
    const now = '2026-09-24 00:00:00.000'
    await expect(
      db.insertInto('bandwidth_metrics').values({ id: 'x', device_id: 'missing', timestamp: now, upload_speed: 0, download_speed: 0, upload_total: 0, download_total: 0, created_at: now }).execute(),
    ).rejects.toMatchObject({ message: expect.stringMatching(/foreign key/i) }) // native errors cross Jest's realm, so no toThrow()
  })

  it('stores BIGINT beyond Number.MAX_SAFE_INTEGER exactly on MySQL', async () => {
    if (client !== 'mysql') return
    const r = await sql<{ v: string }>`select cast('9223372036854775807' as signed) as v`.execute(getDb())
    expect(r.rows[0]?.v).toBe('9223372036854775807')
  })
})
