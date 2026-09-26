import { ANY_ROLE, json, withAuth } from '@/lib/api/handler'
import { AppError } from '@/lib/api/errors'
import { getStatus } from '@/lib/services/routerService'
import type { RouterStatusDTO } from '@/lib/types'

export const GET = withAuth(ANY_ROLE, async () => {
  const s = await getStatus()
  const body: RouterStatusDTO = {
    configured: s.configured,
    reachable: s.reachable,
    routerType: s.config?.routerType ?? null,
    modelNumber: s.config?.modelNumber ?? null,
    firmwareVersion: s.config?.firmwareVersion ?? null,
    lastCheckAt: s.config?.lastCheckAt?.toISOString() ?? null,
    lastSuccessAt: s.config?.lastSuccessAt?.toISOString() ?? null,
  }
  if (s.configured && !s.reachable) {
    throw new AppError('ROUTER_UNREACHABLE', 'The router cannot be reached.', body)
  }
  return json(body)
})
