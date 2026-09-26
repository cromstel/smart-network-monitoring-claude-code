export type DeviceStatus = 'online' | 'offline' | 'idle'

export const DEVICE_TYPES = [
  'phone',
  'laptop',
  'desktop',
  'tablet',
  'tv',
  'console',
  'speaker',
  'camera',
  'iot',
  'printer',
  'wearable',
  'router',
  'server',
  'unknown',
] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export function isDeviceType(v: string): v is DeviceType {
  return (DEVICE_TYPES as readonly string[]).includes(v)
}

export interface Device {
  id: string
  macAddress: string // uppercase, colon-separated
  ipAddress: string
  hostname: string | null
  deviceName: string | null // user-set; falls back to hostname, then MAC
  deviceType: DeviceType
  manufacturer: string | null
  signalStrength: number | null
  status: DeviceStatus
  isBlocked: boolean
  isIgnored: boolean
  totalConnectionTimeSeconds: number
  categoryId: string | null
  firstSeen: Date
  lastSeen: Date
  createdAt: Date
  updatedAt: Date
}

export interface DeviceCategory {
  id: string
  name: string
  color: string
  icon: string | null
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ConnectionLog {
  id: string
  deviceId: string
  eventType: 'connected' | 'disconnected'
  timestamp: Date
  ipAddress: string | null
  connectionDurationSeconds: number | null
}
