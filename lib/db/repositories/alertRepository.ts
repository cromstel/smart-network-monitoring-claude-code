/**
 * Alert RULES. Every read that serves a user takes that user's id and filters by it (PRD F-34).
 * The only unscoped reads are `findActiveMatching` (the engine, which then delivers each match
 * to its own owner) and `listAll` (ADMIN ?scope=all).
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { nowDb, toDbBool } from '../time'
import type { AlertType, DeviceAlert } from '@/lib/types'
import { rowToAlert } from './mappers'

export async function listForUser(userId: string): Promise<DeviceAlert[]> {
  const rows = await getDb()
    .selectFrom('device_alerts')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .execute()
  return rows.map(rowToAlert)
}

export async function listAll(): Promise<DeviceAlert[]> {
  const rows = await getDb().selectFrom('device_alerts').selectAll().orderBy('created_at', 'desc').execute()
  return rows.map(rowToAlert)
}

export async function findByIdForUser(id: string, userId: string): Promise<DeviceAlert | null> {
  const row = await getDb()
    .selectFrom('device_alerts')
    .selectAll()
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row ? rowToAlert(row) : null
}

export async function findById(id: string): Promise<DeviceAlert | null> {
  const row = await getDb().selectFrom('device_alerts').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? rowToAlert(row) : null
}

export async function create(input: {
  userId: string
  deviceId: string | null
  alertType: AlertType
  threshold: number | null
  isActive: boolean
}): Promise<DeviceAlert> {
  const id = randomUUID()
  const now = nowDb()
  await getDb()
    .insertInto('device_alerts')
    .values({
      id,
      user_id: input.userId,
      device_id: input.deviceId,
      alert_type: input.alertType,
      threshold: input.threshold,
      is_active: toDbBool(input.isActive),
      created_at: now,
      updated_at: now,
    })
    .execute()
  const created = await findById(id)
  if (!created) throw new Error('alert insert did not persist')
  return created
}

export async function update(
  id: string,
  patch: { deviceId?: string | null; threshold?: number | null; isActive?: boolean },
): Promise<void> {
  const set: { updated_at: string; device_id?: string | null; threshold?: number | null; is_active?: number } = {
    updated_at: nowDb(),
  }
  if (patch.deviceId !== undefined) set.device_id = patch.deviceId
  if (patch.threshold !== undefined) set.threshold = patch.threshold
  if (patch.isActive !== undefined) set.is_active = toDbBool(patch.isActive)
  await getDb().updateTable('device_alerts').set(set).where('id', '=', id).execute()
}

export async function deleteById(id: string): Promise<void> {
  await getDb().deleteFrom('device_alerts').where('id', '=', id).execute()
}

/** Active rules of a type that cover this device (device-specific or all-devices), owned by active users. */
export async function findActiveMatching(alertType: AlertType, deviceId: string): Promise<DeviceAlert[]> {
  const rows = await getDb()
    .selectFrom('device_alerts')
    .innerJoin('users', 'users.id', 'device_alerts.user_id')
    .selectAll('device_alerts')
    .where('device_alerts.alert_type', '=', alertType)
    .where('device_alerts.is_active', '=', 1)
    .where('users.is_active', '=', 1)
    .where((eb) => eb.or([eb('device_alerts.device_id', '=', deviceId), eb('device_alerts.device_id', 'is', null)]))
    .execute()
  return rows.map(rowToAlert)
}

export async function markTriggered(id: string): Promise<void> {
  const now = nowDb()
  await getDb()
    .updateTable('device_alerts')
    .set((eb) => ({ last_triggered: now, trigger_count: eb('trigger_count', '+', 1), updated_at: now }))
    .where('id', '=', id)
    .execute()
}
