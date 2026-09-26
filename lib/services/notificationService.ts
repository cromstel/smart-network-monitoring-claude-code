/** Notifications are always read and changed as "the caller's own". There is no other scope. */
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import { notFound } from '@/lib/api/errors'
import type { Notification, NotificationType } from '@/lib/types'

export interface ListInput {
  isRead?: boolean
  type?: NotificationType
  from?: Date
  to?: Date
  page: number
  pageSize: number
}

export async function listForUser(userId: string, input: ListInput) {
  return notificationRepo.listForUser(userId, {
    isRead: input.isRead,
    type: input.type,
    from: input.from,
    to: input.to,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })
}

export async function setRead(userId: string, id: string, isRead: boolean): Promise<Notification> {
  const updated = await notificationRepo.setReadForUser(id, userId, isRead)
  if (!updated) throw notFound('Notification')
  const n = await notificationRepo.findByIdForUser(id, userId)
  if (!n) throw notFound('Notification')
  return n
}

export async function markAllRead(userId: string): Promise<number> {
  return notificationRepo.markAllReadForUser(userId)
}

export async function unreadCount(userId: string): Promise<number> {
  return notificationRepo.unreadCount(userId)
}
