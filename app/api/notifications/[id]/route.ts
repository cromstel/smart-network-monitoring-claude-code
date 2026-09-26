import { ANY_ROLE, json, parseBody, withAuth } from '@/lib/api/handler'
import { notificationPatchBody } from '@/lib/api/schemas'
import { toNotificationDTO } from '@/lib/api/serialisers'
import { setRead } from '@/lib/services/notificationService'

/** Acknowledging is reading, which every role may do — but only for the caller's own notifications. */
export const PATCH = withAuth<{ id: string }>(ANY_ROLE, async (req, { auth, params }) => {
  const body = await parseBody(req, notificationPatchBody)
  return json(toNotificationDTO(await setRead(auth.user.id, params.id, body.isRead)))
})
