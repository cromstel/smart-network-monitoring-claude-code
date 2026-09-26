/**
 * Wire shapes. Dates are ISO strings, byte counters are strings, speeds are Mbps numbers.
 * Nothing here carries a secret: no password, hash, or token field exists on any DTO.
 */
import type { DeviceStatus, DeviceType } from './device'
import type { AlertType, NotificationPriority, NotificationType } from './alert'
import type { Role, Theme } from './user'
import type { RouterType } from './router'

export interface Pagination {
  page: number
  pageSize: number
  total: number
}

export interface CollectionResponse<T> {
  data: T[]
  pagination: Pagination
}

export interface ItemResponse<T> {
  data: T
}

export interface ApiErrorBody {
  error: string
  message: string
  details?: unknown
}

export interface ByteCount {
  uploadBytes: string
  downloadBytes: string
}

export interface DeviceDTO {
  id: string
  macAddress: string
  ipAddress: string
  hostname: string | null
  deviceName: string | null
  displayName: string
  deviceType: DeviceType
  manufacturer: string | null
  status: DeviceStatus
  signalStrength: number | null
  firstSeen: string
  lastSeen: string
  totalConnectionTimeSeconds: number
  isBlocked: boolean
  isIgnored: boolean
  isUnknown: boolean
  categoryId: string | null
  currentBandwidth: { uploadMbps: number; downloadMbps: number } | null
  totalTransferred: ByteCount & { uploadMegabytes: number; downloadMegabytes: number }
}

export interface CategoryDTO {
  id: string
  name: string
  color: string
  icon: string | null
  description: string | null
}

export interface ConnectionLogDTO {
  id: string
  eventType: 'connected' | 'disconnected'
  timestamp: string
  ipAddress: string | null
  connectionDurationSeconds: number | null
}

export interface DeviceStatsDTO {
  peakUploadMbps: number
  peakDownloadMbps: number
  averageSessionSeconds: number | null
  sessionCount: number
}

export interface DeviceDetailDTO extends DeviceDTO {
  category: CategoryDTO | null
  connectionLogs: ConnectionLogDTO[]
  stats: DeviceStatsDTO
}

export interface BandwidthPointDTO {
  timestamp: string
  uploadMbps: number
  downloadMbps: number
  uploadBytes: string
  downloadBytes: string
}

export interface BandwidthSeriesDTO {
  deviceId?: string
  range: string
  resolution: 'raw' | 'hourly'
  points: BandwidthPointDTO[]
}

export interface CurrentBandwidthDTO {
  uploadMbps: number
  downloadMbps: number
  onlineDevices: number
  totalDevices: number
  unknownDevices: number
  peakTodayUploadMbps: number
  peakTodayDownloadMbps: number
  sampledAt: string | null
}

export interface TopConsumerDTO {
  deviceId: string
  displayName: string
  deviceType: DeviceType
  status: DeviceStatus
  uploadBytes: string
  downloadBytes: string
  totalBytes: string
  totalMegabytes: number
}

export interface AlertRuleDTO {
  id: string
  userId: string
  deviceId: string | null
  alertType: AlertType
  threshold: number | null
  isActive: boolean
  lastTriggered: string | null
  triggerCount: number
  createdAt: string
}

export interface NotificationDTO {
  id: string
  deviceId: string | null
  alertId: string | null
  title: string
  message: string
  type: NotificationType
  priority: NotificationPriority
  isRead: boolean
  readAt: string | null
  data: Record<string, unknown> | null
  createdAt: string
}

export interface UserDTO {
  id: string
  email: string
  name: string | null
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface SettingsDTO {
  scanIntervalSeconds: number
  dataRetentionDays: number
  networkSubnet: string
  ignoreSubnets: string[]
  notifyNewDevices: boolean
  notifyDeviceOffline: boolean
  notifyHighBandwidth: boolean
  bandwidthThreshold: number
  theme: Theme
}

export interface RouterConfigDTO {
  id: string
  routerType: RouterType
  routerName: string | null
  routerIp: string
  port: number
  username: string
  hasPassword: boolean
  modelNumber: string | null
  firmwareVersion: string | null
  isConnected: boolean
  lastCheckAt: string | null
  lastSuccessAt: string | null
}

export interface RouterStatusDTO {
  configured: boolean
  reachable: boolean
  routerType: RouterType | null
  modelNumber: string | null
  firmwareVersion: string | null
  lastCheckAt: string | null
  lastSuccessAt: string | null
}

export interface ScanResultDTO {
  scanner: string
  durationMs: number
  devicesFound: number
  newDevices: number
  wentOffline: number
}

export interface HealthDTO {
  status: 'ok' | 'degraded'
  version: string
  uptimeSeconds: number
  database: { client: 'mysql' | 'sqlite'; connected: boolean }
  scanner: { mode: string | null; lastScanAt: string | null; healthy: boolean }
}

export type ServerEventName =
  | 'device.connected'
  | 'device.disconnected'
  | 'bandwidth.tick'
  | 'alert.raised'
  | 'scan.completed'
  | 'device.updated'
