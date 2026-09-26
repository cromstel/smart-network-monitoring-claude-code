import { ADMIN_ONLY, json, parseBody, withAuth } from '@/lib/api/handler'
import { userCreateBody } from '@/lib/api/schemas'
import { toUserDTO } from '@/lib/api/serialisers'
import { createUser, listUsers } from '@/lib/services/userService'

export const GET = withAuth(ADMIN_ONLY, async (_req, { auth }) => json((await listUsers(auth.user)).map(toUserDTO)))

export const POST = withAuth(ADMIN_ONLY, async (req, { auth }) => {
  const body = await parseBody(req, userCreateBody)
  const user = await createUser(auth.user, { email: body.email, password: body.password, name: body.name ?? null, role: body.role })
  return json(toUserDTO(user), { status: 201 })
})
