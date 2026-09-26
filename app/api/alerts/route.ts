import { ANY_ROLE, WRITERS, json, parseBody, parseQuery, withAuth } from '@/lib/api/handler'
import { alertCreateBody, alertListQuery } from '@/lib/api/schemas'
import { toAlertRuleDTO } from '@/lib/api/serialisers'
import { createRule, listRules } from '@/lib/services/alertService'

/** Only the caller's own rules, unless an ADMIN passes ?scope=all (PRD F-34). */
export const GET = withAuth(ANY_ROLE, async (req, { auth }) => {
  const q = parseQuery(req, alertListQuery)
  return json((await listRules(auth.user, q.scope)).map(toAlertRuleDTO))
})

/** Owner is taken from the session, never from the body. */
export const POST = withAuth(WRITERS, async (req, { auth }) => {
  const body = await parseBody(req, alertCreateBody)
  const rule = await createRule(auth.user, {
    alertType: body.alertType,
    deviceId: body.deviceId,
    threshold: body.threshold ?? null,
    isActive: body.isActive,
  })
  return json(toAlertRuleDTO(rule), { status: 201 })
})
