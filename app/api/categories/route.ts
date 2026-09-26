import { ANY_ROLE, json, withAuth } from '@/lib/api/handler'
import { toCategoryDTO } from '@/lib/api/serialisers'
import { listCategories } from '@/lib/services/deviceService'

export const GET = withAuth(ANY_ROLE, async () => json((await listCategories()).map(toCategoryDTO)))
