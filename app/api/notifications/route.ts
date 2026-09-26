import { NextResponse } from 'next/server'
import { ANY_ROLE, parseQuery, withAuth } from '@/lib/api/handler'
import { notificationListQuery } from '@/lib/api/schemas'
import { toNotificationDTO } from '@/lib/api/serialisers'
import { listForUser } from '@/lib/services/notificationService'

/** Scoped to the caller. There is no parameter that widens it. */
export const GET = withAuth(ANY_ROLE, async (req, { auth }) => {
  const q = parseQuery(req, notificationListQuery)
  const { notifications, total, unreadCount } = await listForUser(auth.user.id, q)
  return NextResponse.json({
    data: notifications.map(toNotificationDTO),
    pagination: { page: q.page, pageSize: q.pageSize, total },
    unreadCount,
  })
})
