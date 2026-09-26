import { ANY_ROLE, json, withAuth } from '@/lib/api/handler'
import { getCurrent } from '@/lib/services/bandwidthService'
import type { CurrentBandwidthDTO } from '@/lib/types'

export const GET = withAuth(ANY_ROLE, async () => {
  const c = await getCurrent()
  const body: CurrentBandwidthDTO = { ...c, sampledAt: c.sampledAt?.toISOString() ?? null }
  return json(body)
})
