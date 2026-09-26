import { ANY_ROLE, json, withAuth } from '@/lib/api/handler'
import { toUserDTO } from '@/lib/api/serialisers'

export const GET = withAuth(ANY_ROLE, async (_req, { auth }) => json(toUserDTO(auth.user)))
