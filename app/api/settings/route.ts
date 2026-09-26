import { ANY_ROLE, WRITERS, json, parseBody, withAuth } from '@/lib/api/handler'
import { settingsPatchBody } from '@/lib/api/schemas'
import { toSettingsDTO } from '@/lib/api/serialisers'
import { getForUser, update } from '@/lib/services/settingsService'

export const GET = withAuth(ANY_ROLE, async (_req, { auth }) => json(toSettingsDTO(await getForUser(auth.user.id))))

/** Personal fields: ADMIN, MEMBER. Network-wide fields (interval, retention, subnets): ADMIN only. */
export const PATCH = withAuth(WRITERS, async (req, { auth }) => {
  const body = await parseBody(req, settingsPatchBody)
  return json(toSettingsDTO(await update(auth.user, body)))
})
