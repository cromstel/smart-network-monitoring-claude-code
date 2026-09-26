import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { getDb, getDbClient } from '../client'
import type { DB, DeviceUpdate } from '../schema'
import { nowDb, toCount, toDbBool, toDbTime } from '../time'
import type { Device, DeviceStatus, DeviceType } from '@/lib/types'
import { rowToDevice } from './mappers'

export interface DeviceListFilters {
  status?: DeviceStatus
  type?: string
  search?: string
  categoryId?: string
  includeIgnored?: boolean
  sort?: 'name' | 'lastSeen'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/** '!' as the LIKE escape: backslash means different things in MySQL and SQLite string literals. */
function escapeLike(term: string): string {
  return term.replace(/[!%_]/g, (c) => `!${c}`)
}

const SEARCHABLE = ['device_name', 'hostname', 'ip_address', 'mac_address', 'manufacturer'] as const

function filtered(db: Kysely<DB>, f: DeviceListFilters) {
  let q = db.selectFrom('devices')
  if (!f.includeIgnored) q = q.where('is_ignored', '=', 0)
  if (f.status) q = q.where('status', '=', f.status)
  if (f.type) q = q.where('device_type', '=', f.type)
  if (f.categoryId) q = q.where('category_id', '=', f.categoryId)
  if (f.search?.trim()) {
    const term = `%${escapeLike(f.search.trim())}%`
    q = q.where((eb) => eb.or(SEARCHABLE.map((col) => sql<boolean>`${sql.ref(col)} like ${term} escape '!'`)))
  }
  return q
}

export async function list(f: DeviceListFilters): Promise<{ devices: Device[]; total: number }> {
  const db = getDb()
  const countRow = await filtered(db, f).select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()
  const direction = f.order ?? (f.sort === 'name' ? 'asc' : 'desc')
  let q = filtered(db, f).selectAll()
  q =
    f.sort === 'name'
      ? q.orderBy(sql`lower(coalesce(device_name, hostname, mac_address))`, direction)
      : q.orderBy('last_seen', direction)
  q = q.orderBy('id', 'asc')
  if (f.limit !== undefined) q = q.limit(f.limit).offset(f.offset ?? 0)
  const rows = await q.execute()
  return { devices: rows.map(rowToDevice), total: toCount(countRow?.n) }
}

export async function findById(id: string): Promise<Device | null> {
  const row = await getDb().selectFrom('devices').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? rowToDevice(row) : null
}

export async function findByMac(macAddress: string): Promise<Device | null> {
  const row = await getDb()
    .selectFrom('devices')
    .selectAll()
    .where('mac_address', '=', macAddress.toUpperCase())
    .executeTakeFirst()
  return row ? rowToDevice(row) : null
}

export async function findAll(): Promise<Device[]> {
  const rows = await getDb().selectFrom('devices').selectAll().orderBy('first_seen', 'asc').execute()
  return rows.map(rowToDevice)
}

export async function findByIds(ids: string[]): Promise<Device[]> {
  if (ids.length === 0) return []
  const rows = await getDb().selectFrom('devices').selectAll().where('id', 'in', ids).execute()
  return rows.map(rowToDevice)
}

export async function findPresent(): Promise<Device[]> {
  const rows = await getDb().selectFrom('devices').selectAll().where('status', 'in', ['online', 'idle']).execute()
  return rows.map(rowToDevice)
}

export async function findOnlineLastSeenBefore(cutoff: Date): Promise<Device[]> {
  const rows = await getDb()
    .selectFrom('devices')
    .selectAll()
    .where('status', 'in', ['online', 'idle'])
    .where('last_seen', '<', toDbTime(cutoff))
    .execute()
  return rows.map(rowToDevice)
}

export interface ScanUpsertInput {
  macAddress: string
  ipAddress: string
  hostname: string | null
  manufacturer: string | null
  signalStrength: number | null
  status: DeviceStatus
  seenAt: Date
  deviceType?: DeviceType
}

/**
 * Insert-or-update keyed on the MAC address. MAC is uppercased here so a lowercase input
 * can never create a second row (SQLite compares case-sensitively; MySQL's collation does not).
 * Kysely's onConflict() is PostgreSQL/SQLite syntax only — MySQL needs onDuplicateKeyUpdate().
 */
export async function upsertFromScan(input: ScanUpsertInput): Promise<void> {
  const db = getDb()
  const seen = toDbTime(input.seenAt)
  const now = nowDb()
  const mac = input.macAddress.toUpperCase()

  const update = {
    ip_address: input.ipAddress,
    status: input.status,
    last_seen: seen,
    updated_at: now, // set explicitly — SQLite has no ON UPDATE
    ...(input.hostname ? { hostname: input.hostname } : {}),
    ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
    ...(input.signalStrength !== null ? { signal_strength: input.signalStrength } : {}),
  }

  const insert = db.insertInto('devices').values({
    id: randomUUID(),
    mac_address: mac,
    ip_address: input.ipAddress,
    hostname: input.hostname,
    manufacturer: input.manufacturer,
    signal_strength: input.signalStrength,
    device_type: input.deviceType ?? 'unknown',
    status: input.status,
    first_seen: seen,
    last_seen: seen,
    created_at: now,
    updated_at: now,
  })

  if (getDbClient() === 'mysql') {
    await insert.onDuplicateKeyUpdate(update).execute()
  } else {
    await insert.onConflict((oc) => oc.column('mac_address').doUpdateSet(update)).execute()
  }
}

export async function updateStatus(id: string, status: DeviceStatus): Promise<void> {
  await getDb().updateTable('devices').set({ status, updated_at: nowDb() }).where('id', '=', id).execute()
}

export async function addConnectionTime(id: string, seconds: number): Promise<void> {
  if (seconds <= 0) return
  await getDb()
    .updateTable('devices')
    .set((eb) => ({ total_connection_time: eb('total_connection_time', '+', Math.round(seconds)), updated_at: nowDb() }))
    .where('id', '=', id)
    .execute()
}

export interface DeviceMetadataPatch {
  deviceName?: string | null
  deviceType?: DeviceType
  categoryId?: string | null
  isIgnored?: boolean
}

export async function updateMetadata(id: string, patch: DeviceMetadataPatch): Promise<Device | null> {
  const set: DeviceUpdate = { updated_at: nowDb() }
  if (patch.deviceName !== undefined) set.device_name = patch.deviceName
  if (patch.deviceType !== undefined) set.device_type = patch.deviceType
  if (patch.categoryId !== undefined) set.category_id = patch.categoryId
  if (patch.isIgnored !== undefined) set.is_ignored = toDbBool(patch.isIgnored)
  await getDb().updateTable('devices').set(set).where('id', '=', id).execute()
  return findById(id)
}

export async function setBlocked(id: string, blocked: boolean): Promise<void> {
  await getDb()
    .updateTable('devices')
    .set({ is_blocked: toDbBool(blocked), updated_at: nowDb() })
    .where('id', '=', id)
    .execute()
}

export async function deleteById(id: string): Promise<boolean> {
  const result = await getDb().deleteFrom('devices').where('id', '=', id).executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

export async function counts(): Promise<{ total: number; online: number; unknown: number }> {
  const rows = await getDb()
    .selectFrom('devices')
    .select(['status', (eb) => eb.fn.countAll().as('n')])
    .where('is_ignored', '=', 0)
    .groupBy('status')
    .execute()
  let total = 0
  let online = 0
  for (const r of rows) {
    const n = toCount(r.n)
    total += n
    if (r.status === 'online' || r.status === 'idle') online += n
  }
  const unknownRow = await getDb()
    .selectFrom('devices')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('is_ignored', '=', 0)
    .where('device_name', 'is', null)
    .executeTakeFirst()
  return { total, online, unknown: toCount(unknownRow?.n) }
}
