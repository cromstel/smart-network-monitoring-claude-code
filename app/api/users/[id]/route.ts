import { ADMIN_ONLY, json, noContent, parseBody, withAuth } from '@/lib/api/handler'
import { userPatchBody } from '@/lib/api/schemas'
import { toUserDTO } from '@/lib/api/serialisers'
import { deleteUser, updateUser } from '@/lib/services/userService'

type Params = { id: string }

export const PATCH = withAuth<Params>(ADMIN_ONLY, async (req, { auth, params }) => {
  const body = await parseBody(req, userPatchBody)
  return json(toUserDTO(await updateUser(auth.user, params.id, body)))
})

export const DELETE = withAuth<Params>(ADMIN_ONLY, async (_req, { auth, params }) => {
  await deleteUser(auth.user, params.id)
  return noContent()
})
