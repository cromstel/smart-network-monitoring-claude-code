export const ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

export interface User {
  id: string
  email: string
  name: string | null
  role: Role
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  userId: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export type Theme = 'dark' | 'light' | 'system'

export interface UserSettings {
  id: string
  userId: string
  scanIntervalSeconds: number
  dataRetentionDays: number
  networkSubnet: string
  ignoreSubnets: string[]
  notifyNewDevices: boolean
  notifyDeviceOffline: boolean
  notifyHighBandwidth: boolean
  bandwidthThreshold: number
  theme: Theme
  createdAt: Date
  updatedAt: Date
}

/** Settings that describe the one monitored network rather than one user's preferences. */
export interface NetworkSettings {
  scanIntervalSeconds: number
  dataRetentionDays: number
  networkSubnet: string
  ignoreSubnets: string[]
}
