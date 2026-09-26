import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DeviceList } from '@/components/devices/DeviceList'
import { SkeletonRows } from '@/components/ui/states'

export const metadata: Metadata = { title: 'Devices' }

export default function DevicesPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <DeviceList />
    </Suspense>
  )
}
