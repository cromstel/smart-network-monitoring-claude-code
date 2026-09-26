import type { Metadata } from 'next'
import { RouterView } from '@/components/router/RouterView'

export const metadata: Metadata = { title: 'Router' }

export default function RouterPage() {
  return <RouterView />
}
