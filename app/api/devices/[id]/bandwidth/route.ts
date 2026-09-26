import { ANY_ROLE, json, parseQuery, withAuth } from '@/lib/api/handler'
import { bandwidthQuery } from '@/lib/api/schemas'
import { toPointDTO } from '@/lib/api/serialisers'
import { defaultResolution, getDeviceSeries } from '@/lib/services/bandwidthService'
import { getDevice } from '@/lib/services/deviceService'

export const GET = withAuth<{ id: string }>(ANY_ROLE, async (req, { params }) => {
  const q = parseQuery(req, bandwidthQuery)
  const resolution = q.resolution ?? defaultResolution(q.range)
  await getDevice(params.id) // 404 for an unknown device
  const points = await getDeviceSeries(params.id, q.range, resolution)
  return json({ deviceId: params.id, range: q.range, resolution, points: points.map(toPointDTO) })
})
