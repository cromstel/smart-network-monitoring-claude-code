import { ADMIN_ONLY, ANY_ROLE, WRITERS, json, noContent, parseBody, withAuth } from '@/lib/api/handler'
import { devicePatchBody } from '@/lib/api/schemas'
import { toDeviceDTO, toDeviceDetailDTO } from '@/lib/api/serialisers'
import { deleteDevice, getDevice, updateDevice } from '@/lib/services/deviceService'

type Params = { id: string }

export const GET = withAuth<Params>(ANY_ROLE, async (_req, { params }) => json(toDeviceDetailDTO(await getDevice(params.id))))

export const PATCH = withAuth<Params>(WRITERS, async (req, { params }) => {
  const body = await parseBody(req, devicePatchBody)
  return json(toDeviceDTO(await updateDevice(params.id, body)))
})

export const DELETE = withAuth<Params>(ADMIN_ONLY, async (_req, { params }) => {
  await deleteDevice(params.id)
  return noContent()
})
