import { WRITERS, json, noContent, parseBody, withAuth } from '@/lib/api/handler'
import { alertPatchBody } from '@/lib/api/schemas'
import { toAlertRuleDTO } from '@/lib/api/serialisers'
import { deleteRule, updateRule } from '@/lib/services/alertService'

type Params = { id: string }

/** Owner or ADMIN. A non-owner gets 404, not 403 — a 403 would confirm the rule exists. */
export const PATCH = withAuth<Params>(WRITERS, async (req, { auth, params }) => {
  const body = await parseBody(req, alertPatchBody)
  return json(toAlertRuleDTO(await updateRule(auth.user, params.id, body)))
})

export const DELETE = withAuth<Params>(WRITERS, async (_req, { auth, params }) => {
  await deleteRule(auth.user, params.id)
  return noContent()
})
