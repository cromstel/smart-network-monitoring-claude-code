/** Alert INSTANCES. Every user-facing read and write is scoped by user_id. */
import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { nowDb, toCount, toDbBool, toDbTime } from '../time'
import type { Notification, NotificationPriority, NotificationType } from '@/lib/types'
import { rowToNotification } from './mappers'

export interface NewNotification {
  userId: string
  deviceId: string | null
  alertId: string | null
  title: string
  message: string
  type: NotificationType
  priority: NotificationPriority
  data: Record<string, unknown> | null
}

export async function create(n: NewNotification): Promise<Notification> {
  const id = randomUUID()
  await getDb()
    .insertInto('notifications')
    .values({
      id,
      user_id: n.userId,
      device_id: n.deviceId,
      alert_id: n.alertId,
      title: n.title.slice(0, 255),
      message: n.message,
      type: n.type,
      priority: n.priority,
      is_read: 0,
      data: n.data ? JSON.stringify(n.data) : null,
      created_at: nowDb(),
    })
    .execute()
  const row = await getDb().selectFrom('notifications').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  return rowToNotification(row)
}

export interface NotificationFilters {
  isRead?: boolean
  type?: NotificationType
  from?: Date
  to?: Date
  limit: number
  offset: number
}

export async function listForUser(
  userId: string,
  f: NotificationFilters,
): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
  const db = getDb()
  let base = db.selectFrom('notifications').where('user_id', '=', userId)
  if (f.isRead !== undefined) base = base.where('is_read', '=', toDbBool(f.isRead))
  if (f.type) base = base.where('type', '=', f.type)
  if (f.from) base = base.where('created_at', '>=', toDbTime(f.from))
  if (f.to) base = base.where('created_at', '<=', toDbTime(f.to))
  const [rows, total, unread] = await Promise.all([
    base.selectAll().orderBy('created_at', 'desc').orderBy('id', 'asc').limit(f.limit).offset(f.offset).execute(),
    base.select((eb) => eb.fn.countAll().as('n')).executeTakeFirst(),
    unreadCount(userId),
  ])
  return { notifications: rows.map(rowToNotification), total: toCount(total?.n), unreadCount: unread }
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await getDb()
    .selectFrom('notifications')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('user_id', '=', userId)
    .where('is_read', '=', 0)
    .executeTakeFirst()
  return toCount(row?.n)
}

export async function findByIdForUser(id: string, userId: string): Promise<Notification | null> {
  const row = await getDb()
    .selectFrom('notifications')
    .selectAll()
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row ? rowToNotification(row) : null
}

export async function setReadForUser(id: string, userId: string, isRead: boolean): Promise<boolean> {
  const res = await getDb()
    .updateTable('notifications')
    .set({ is_read: toDbBool(isRead), read_at: isRead ? nowDb() : null })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return Number(res.numUpdatedRows) > 0
}

export async function markAllReadForUser(userId: string): Promise<number> {
  const res = await getDb()
    .updateTable('notifications')
    .set({ is_read: 1, read_at: nowDb() })
    .where('user_id', '=', userId)
    .where('is_read', '=', 0)
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
}

/** Dedup guard: has this rule already fired for this device since `since`? */
export async function existsForAlertSince(alertId: string, deviceId: string | null, since: Date): Promise<boolean> {
  let q = getDb()
    .selectFrom('notifications')
    .select('id')
    .where('alert_id', '=', alertId)
    .where('created_at', '>=', toDbTime(since))
  q = deviceId === null ? q.where('device_id', 'is', null) : q.where('device_id', '=', deviceId)
  const row = await q.limit(1).executeTakeFirst()
  return row !== undefined
}

export async function selectIdsBefore(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await getDb()
    .selectFrom('notifications')
    .select('id')
    .where('created_at', '<', toDbTime(cutoff))
    .limit(limit)
    .execute()
  return rows.map((r) => r.id)
}

export async function deleteByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await getDb().deleteFrom('notifications').where('id', 'in', ids).executeTakeFirst()
  return Number(res.numDeletedRows)
}

/** Dedup guard for built-in (settings-driven) alerts, which have no rule id. `kind` is stored in data. */
export async function existsBuiltInSince(userId: string, deviceId: string, kind: string, since: Date): Promise<boolean> {
  const row = await getDb()
    .selectFrom('notifications')
    .select('id')
    .where('user_id', '=', userId)
    .where('device_id', '=', deviceId)
    .where('alert_id', 'is', null)
    .where('data', 'like', `%"kind":"${kind}"%`)
    .where('created_at', '>=', toDbTime(since))
    .limit(1)
    .executeTakeFirst()
  return row !== undefined
}
