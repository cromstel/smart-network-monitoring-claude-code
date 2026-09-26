import {
  Camera,
  Cpu,
  Gamepad2,
  HelpCircle,
  Laptop,
  Monitor,
  Printer,
  Router,
  Server,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
  type LucideIcon,
} from 'lucide-react'
import type { DeviceType } from '@/lib/types'
import { cn } from '@/lib/utils/cn'

const ICONS: Record<DeviceType, LucideIcon> = {
  phone: Smartphone,
  laptop: Laptop,
  desktop: Monitor,
  tablet: Tablet,
  tv: Tv,
  console: Gamepad2,
  speaker: Speaker,
  camera: Camera,
  iot: Cpu,
  printer: Printer,
  wearable: Watch,
  router: Router,
  server: Server,
  unknown: HelpCircle,
}

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  phone: 'Phone',
  laptop: 'Laptop',
  desktop: 'Desktop',
  tablet: 'Tablet',
  tv: 'TV / streaming',
  console: 'Game console',
  speaker: 'Smart speaker',
  camera: 'Camera',
  iot: 'Smart home / IoT',
  printer: 'Printer',
  wearable: 'Wearable',
  router: 'Network gear',
  server: 'Server / NAS',
  unknown: 'Unknown',
}

export function DeviceIcon({ type, unknown, className }: { type: DeviceType; unknown?: boolean; className?: string }) {
  const Icon = ICONS[type] ?? HelpCircle
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded border',
        unknown ? 'border-warning/50 bg-warning/10 text-warning' : 'border-border bg-surface-2 text-fg/80',
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}
