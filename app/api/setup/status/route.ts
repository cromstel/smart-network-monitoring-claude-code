import { json, publicRoute } from '@/lib/api/handler'
import { conflict } from '@/lib/api/errors'
import { needsSetup } from '@/lib/services/authService'

export const dynamic = 'force-dynamic'

export const GET = publicRoute(async () => {
  if (!(await needsSetup())) throw conflict('Setup has already been completed.')
  return json({ needsSetup: true })
})
