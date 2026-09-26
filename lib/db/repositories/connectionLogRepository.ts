import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { fromDbTime, nowDb, toCount, toDbTime } from '../time'
import type { ConnectionLog } from '@/lib/types'
import { rowToConnectionLog } from './mappers'

export async function logConnection(deviceId: string, ipAddress: string | null, at: Date): Promise<void> {
  await getDb()
    .insertInto('connection_logs')
    .values({
      id: randomUUID(),
      device_id: deviceId,
      event_type: 'connected',
      timestamp: toDbTime(at),
      ip_address: ipAddress,
      connection_duration: null,
      created_at: nowDb(),
    })
    .execute()
}

export async function logDisconnection(
  deviceId: string,
  ipAddress: string | null,
  at: Date,
  durationSeconds: number | null,
): Promise<void> {
  await getDb()
    .insertInto('connection_logs')
    .values({
      id: randomUUID(),
      device_id: deviceId,
      event_type: 'disconnected',
      timestamp: toDbTime(at),
      ip_address: ipAddress,
      connection_duration: durationSeconds === null ? null : Math.max(0, Math.round(durationSeconds)),
      created_at: nowDb(),
    })
    .execute()
}

/** Latest 'connected' event per device — the start of the current session. */
export async function latestConnectedAt(deviceIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  if (deviceIds.length === 0) return out
  const rows = await getDb()
    .selectFrom('connection_logs')
    .select(['device_id', (eb) => eb.fn.max('timestamp').as('ts')])
    .where('device_id', 'in', deviceIds)
    .where('event_type', '=', 'connected')
    .groupBy('device_id')
    .execute()
  for (const r of rows) if (r.ts) out.set(r.device_id, fromDbTime(String(r.ts)))
  return out
}

export async function recentForDevice(deviceId: string, limit = 20): Promise<ConnectionLog[]> {
  const rows = await getDb()
    .selectFrom('connection_logs')
    .selectAll()
    .where('device_id', '=', deviceId)
    .orderBy('timestamp', 'desc')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute()
  return rows.map(rowToConnectionLog)
}

export async function sessionStats(deviceId: string): Promise<{ sessionCount: number; averageSessionSeconds: number | null }> {
  const row = await getDb()
    .selectFrom('connection_logs')
    .select([(eb) => eb.fn.countAll().as('n'), (eb) => eb.fn.avg('connection_duration').as('avg')])
    .where('device_id', '=', deviceId)
    .where('event_type', '=', 'disconnected')
    .where('connection_duration', 'is not', null)
    .executeTakeFirst()
  const n = toCount(row?.n)
  return { sessionCount: n, averageSessionSeconds: n > 0 && row?.avg !== null && row?.avg !== undefined ? Number(row.avg) : null }
}

export async function selectIdsBefore(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await getDb()
    .selectFrom('connection_logs')
    .select('id')
    .where('timestamp', '<', toDbTime(cutoff))
    .limit(limit)
    .execute()
  return rows.map((r) => r.id)
}

export async function deleteByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await getDb().deleteFrom('connection_logs').where('id', 'in', ids).executeTakeFirst()
  return Number(res.numDeletedRows)
}
