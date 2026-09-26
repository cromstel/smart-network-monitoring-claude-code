import { NextResponse } from 'next/server'
import { ANY_ROLE, parseQuery, withAuth } from '@/lib/api/handler'
import { deviceListQuery } from '@/lib/api/schemas'
import { toDeviceDTO } from '@/lib/api/serialisers'
import { listDevices } from '@/lib/services/deviceService'

export const GET = withAuth(ANY_ROLE, async (req) => {
  const q = parseQuery(req, deviceListQuery)
  const { devices, total } = await listDevices(q)
  return NextResponse.json({
    data: devices.map(toDeviceDTO),
    pagination: { page: q.page, pageSize: q.pageSize, total },
  })
})
