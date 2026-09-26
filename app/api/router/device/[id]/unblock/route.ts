import { ADMIN_ONLY, withAuth } from '@/lib/api/handler'
import { setBlocked } from '@/lib/services/routerService'

export const POST = withAuth<{ id: string }>(ADMIN_ONLY, async (_req, { params }) => setBlocked(params.id, false))
