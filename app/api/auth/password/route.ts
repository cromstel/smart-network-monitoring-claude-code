import { ANY_ROLE, noContent, parseBody, withAuth } from '@/lib/api/handler'
import { changePasswordBody } from '@/lib/api/schemas'
import { changePassword } from '@/lib/services/authService'

/** Any signed-in user may change their own password. */
export const POST = withAuth(ANY_ROLE, async (req, { auth }) => {
  const body = await parseBody(req, changePasswordBody)
  await changePassword(auth.user.id, body.currentPassword, body.newPassword)
  return noContent()
})
