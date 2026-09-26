import { ANY_ROLE, json, parseQuery, withAuth } from '@/lib/api/handler'
import { topConsumersQuery } from '@/lib/api/schemas'
import { toTopConsumerDTO } from '@/lib/api/serialisers'
import { getTopConsumers } from '@/lib/services/bandwidthService'

export const GET = withAuth(ANY_ROLE, async (req) => {
  const q = parseQuery(req, topConsumersQuery)
  return json((await getTopConsumers(q.range, q.limit)).map(toTopConsumerDTO))
})
