import { ADMIN_ONLY, json, parseBody, withAuth } from '@/lib/api/handler'
import { routerTestBody } from '@/lib/api/schemas'
import { testConnection } from '@/lib/services/routerService'

/** Tests submitted or stored credentials. Returns reachability, model and firmware — never credentials. */
export const POST = withAuth(ADMIN_ONLY, async (req) => {
  const body = await parseBody(req, routerTestBody)
  return json(await testConnection(Object.keys(body).length > 0 ? body : undefined))
})
