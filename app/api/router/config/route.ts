import { ADMIN_ONLY, json, parseBody, withAuth } from '@/lib/api/handler'
import { routerConfigBody } from '@/lib/api/schemas'
import { toRouterConfigDTO } from '@/lib/api/serialisers'
import { getConfig, saveConfig } from '@/lib/services/routerService'

/** Never includes a password field — there is no query, header, or role that adds it (A-09). */
export const GET = withAuth(ADMIN_ONLY, async () => {
  const config = await getConfig()
  return json(config ? toRouterConfigDTO(config) : null)
})

export const PUT = withAuth(ADMIN_ONLY, async (req) => {
  const body = await parseBody(req, routerConfigBody)
  return json(toRouterConfigDTO(await saveConfig(body)))
})
