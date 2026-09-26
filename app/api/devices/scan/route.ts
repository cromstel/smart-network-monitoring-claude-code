import { WRITERS, json, withAuth } from '@/lib/api/handler'
import { rateLimited } from '@/lib/api/errors'
import { runScan } from '@/lib/services/scanService'
import { LIMITS, hit } from '@/lib/utils/rateLimit'

/** Manual scan. One at a time (409 if running), 10 per hour. */
export const POST = withAuth(WRITERS, async () => {
  const limit = hit('scan:manual', LIMITS.scan.limit, LIMITS.scan.windowMs)
  if (!limit.allowed) throw rateLimited(limit.retryAfterSeconds)
  return json(await runScan())
})
