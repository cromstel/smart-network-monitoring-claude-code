import { ANY_ROLE, json, withAuth } from '@/lib/api/handler'
import { markAllRead } from '@/lib/services/notificationService'

export const POST = withAuth(ANY_ROLE, async (_req, { auth }) => json({ updated: await markAllRead(auth.user.id) }))
