import { ANY_ROLE, json, parseQuery, withAuth } from '@/lib/api/handler'
import { bandwidthQuery } from '@/lib/api/schemas'
import { toPointDTO } from '@/lib/api/serialisers'
import { defaultResolution, getNetworkSeries } from '@/lib/services/bandwidthService'

export const GET = withAuth(ANY_ROLE, async (req) => {
  const q = parseQuery(req, bandwidthQuery)
  const resolution = q.resolution ?? defaultResolution(q.range)
  const points = await getNetworkSeries(q.range, resolution)
  return json({ range: q.range, resolution, points: points.map(toPointDTO) })
})
