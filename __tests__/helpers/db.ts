/**
 * Real-database test harness. Integration suites run once per dialect; MySQL is included when
 * DB_CLIENT=mysql (npm run test:mysql, and CI), SQLite always.
 */
import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { closeDb, createDb, setDb, type DbClient } from '@/lib/db/client'
import { migrateToLatest } from '@/lib/db/migrator'
import type { DB } from '@/lib/db/schema'
import { nowDb } from '@/lib/db/time'
import * as userRepo from '@/lib/db/repositories/userRepository'
import * as settingsRepo from '@/lib/db/repositories/settingsRepository'
import { hashToken } from '@/lib/security/tokens'
import type { Role, User } from '@/lib/types'

export const DIALECTS: DbClient[] = process.env.DB_CLIENT === 'mysql' ? ['sqlite', 'mysql'] : ['sqlite']

export async function createTestDb(client: DbClient): Promise<Kysely<DB>> {
  const db =
    client === 'mysql'
      ? createDb({
          client: 'mysql',
          host: process.env.DB_HOST ?? '127.0.0.1',
          port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_TEST_NAME,
          connectionLimit: 4,
        })
      : createDb({ client: 'sqlite', file: ':memory:' })
  setDb(db, client)
  await migrateToLatest(db)
  await truncateAll(db) // a persistent MySQL test database may hold rows from an aborted run
  return db
}

const DELETE_ORDER = [
  'notifications',
  'device_alerts',
  'sessions',
  'user_settings',
  'users',
  'bandwidth_hourly',
  'bandwidth_metrics',
  'connection_logs',
  'network_metrics',
  'network_scan_history',
  'router_config',
  'devices',
  'device_categories',
] as const

export async function truncateAll(db: Kysely<DB>): Promise<void> {
  for (const t of DELETE_ORDER) await db.deleteFrom(t).execute()
}

export async function destroyTestDb(): Promise<void> {
  await closeDb()
}

/** Fast user creation: a pre-computed bcrypt hash would still cost ~250ms, and tests never log in with it. */
export async function createUser(name: string, role: Role = 'MEMBER', settings: Partial<{ notifyNewDevices: boolean; notifyDeviceOffline: boolean; notifyHighBandwidth: boolean; bandwidthThreshold: number }> = {}): Promise<User> {
  const user = await userRepo.create({ email: `${name}@example.test`, passwordHash: 'x', name, role })
  await settingsRepo.createForUser(user.id, { scanIntervalSeconds: 30, dataRetentionDays: 30, networkSubnet: '192.168.1.0/24', ignoreSubnets: [] })
  await settingsRepo.updatePersonal(user.id, {
    notifyNewDevices: settings.notifyNewDevices ?? false,
    notifyDeviceOffline: settings.notifyDeviceOffline ?? false,
    notifyHighBandwidth: settings.notifyHighBandwidth ?? false,
    ...(settings.bandwidthThreshold !== undefined ? { bandwidthThreshold: settings.bandwidthThreshold } : {}),
  })
  return user
}

/** A valid session cookie value for `user`, without going through bcrypt. */
export async function sessionTokenFor(user: User, ttlMs = 7 * 24 * 3600_000): Promise<string> {
  const token = `test-${randomUUID()}-${randomUUID()}`
  await userRepo.createSession({
    userId: user.id,
    tokenHash: hashToken(token, process.env.SESSION_SECRET as string),
    expiresAt: new Date(Date.now() + ttlMs),
    ipAddress: null,
    userAgent: 'jest',
  })
  return token
}

export async function insertDevice(db: Kysely<DB>, o: Partial<{ mac: string; ip: string; name: string | null; status: string; lastSeen: string }> = {}): Promise<string> {
  const id = randomUUID()
  const now = nowDb()
  await db
    .insertInto('devices')
    .values({
      id,
      mac_address: o.mac ?? 'A4:83:E7:2C:11:09',
      ip_address: o.ip ?? '192.168.1.42',
      device_name: o.name === undefined ? null : o.name,
      status: o.status ?? 'online',
      first_seen: o.lastSeen ?? now,
      last_seen: o.lastSeen ?? now,
      created_at: now,
      updated_at: now,
    })
    .execute()
  return id
}
