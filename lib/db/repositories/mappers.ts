/** snake_case rows -> camelCase domain types. The one place column naming is translated. */
import type {
  BandwidthHourly,
  BandwidthMetric,
  ConnectionLog,
  Device,
  DeviceAlert,
  DeviceCategory,
  NetworkMetric,
  Notification,
  RouterConfig,
  ScanHistory,
  Session,
  User,
  UserSettings,
} from '@/lib/types'
import { isDeviceType } from '@/lib/types/device'
import { ALERT_TYPES, type AlertType, type NotificationPriority, type NotificationType } from '@/lib/types/alert'
import { ROLES, type Role, type Theme } from '@/lib/types/user'
import { ROUTER_TYPES, type RouterType } from '@/lib/types/router'
import type {
  BandwidthHourlyRow,
  BandwidthMetricRow,
  CategoryRow,
  ConnectionLogRow,
  DeviceAlertRow,
  DeviceRow,
  NetworkMetricRow,
  NotificationRow,
  RouterConfigRow,
  ScanHistoryRow,
  SessionRow,
  UserRow,
  UserSettingsRow,
} from '../schema'
import { fromDbBool, fromDbTime, fromDbTimeOrNull, toBigString } from '../time'

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function rowToDevice(r: DeviceRow): Device {
  const status = r.status === 'online' || r.status === 'idle' ? r.status : 'offline'
  return {
    id: r.id,
    macAddress: r.mac_address,
    ipAddress: r.ip_address,
    hostname: r.hostname,
    deviceName: r.device_name,
    deviceType: isDeviceType(r.device_type) ? r.device_type : 'unknown',
    manufacturer: r.manufacturer,
    signalStrength: r.signal_strength === null ? null : Number(r.signal_strength),
    status,
    isBlocked: fromDbBool(r.is_blocked),
    isIgnored: fromDbBool(r.is_ignored),
    totalConnectionTimeSeconds: Number(r.total_connection_time),
    categoryId: r.category_id,
    firstSeen: fromDbTime(r.first_seen),
    lastSeen: fromDbTime(r.last_seen),
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

export function rowToCategory(r: CategoryRow): DeviceCategory {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    icon: r.icon,
    description: r.description,
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

export function rowToConnectionLog(r: ConnectionLogRow): ConnectionLog {
  return {
    id: r.id,
    deviceId: r.device_id,
    eventType: r.event_type === 'disconnected' ? 'disconnected' : 'connected',
    timestamp: fromDbTime(r.timestamp),
    ipAddress: r.ip_address,
    connectionDurationSeconds: r.connection_duration === null ? null : Number(r.connection_duration),
  }
}

export function rowToMetric(r: BandwidthMetricRow): BandwidthMetric {
  return {
    id: r.id,
    deviceId: r.device_id,
    timestamp: fromDbTime(r.timestamp),
    uploadSpeed: Number(r.upload_speed),
    downloadSpeed: Number(r.download_speed),
    uploadTotal: toBigString(r.upload_total),
    downloadTotal: toBigString(r.download_total),
  }
}

export function rowToHourly(r: BandwidthHourlyRow): BandwidthHourly {
  return {
    id: r.id,
    deviceId: r.device_id,
    hourStart: fromDbTime(r.hour_start),
    avgUploadSpeed: Number(r.avg_upload_speed),
    avgDownloadSpeed: Number(r.avg_download_speed),
    peakUploadSpeed: Number(r.peak_upload_speed),
    peakDownloadSpeed: Number(r.peak_download_speed),
    bytesUploaded: toBigString(r.bytes_uploaded),
    bytesDownloaded: toBigString(r.bytes_downloaded),
    sampleCount: Number(r.sample_count),
  }
}

export function rowToUser(r: Omit<UserRow, 'password_hash'>): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: oneOf<Role>(ROLES, r.role, 'VIEWER'),
    isActive: fromDbBool(r.is_active),
    lastLoginAt: fromDbTimeOrNull(r.last_login_at),
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

export function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    userId: r.user_id,
    expiresAt: fromDbTime(r.expires_at),
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: fromDbTime(r.created_at),
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function rowToSettings(r: UserSettingsRow): UserSettings {
  return {
    id: r.id,
    userId: r.user_id,
    scanIntervalSeconds: Number(r.scan_interval_seconds),
    dataRetentionDays: Number(r.data_retention_days),
    networkSubnet: r.network_subnet,
    ignoreSubnets: parseJsonArray(r.ignore_subnets),
    notifyNewDevices: fromDbBool(r.notify_new_devices),
    notifyDeviceOffline: fromDbBool(r.notify_device_offline),
    notifyHighBandwidth: fromDbBool(r.notify_high_bandwidth),
    bandwidthThreshold: Number(r.bandwidth_threshold),
    theme: oneOf<Theme>(['dark', 'light', 'system'], r.theme, 'dark'),
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

export function rowToAlert(r: DeviceAlertRow): DeviceAlert {
  return {
    id: r.id,
    userId: r.user_id,
    deviceId: r.device_id,
    alertType: oneOf<AlertType>(ALERT_TYPES, r.alert_type, 'unknown_device'),
    threshold: r.threshold === null ? null : Number(r.threshold),
    isActive: fromDbBool(r.is_active),
    lastTriggered: fromDbTimeOrNull(r.last_triggered),
    triggerCount: Number(r.trigger_count),
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    deviceId: r.device_id,
    alertId: r.alert_id,
    title: r.title,
    message: r.message,
    type: oneOf<NotificationType>(['info', 'success', 'warning', 'error'], r.type, 'info'),
    priority: oneOf<NotificationPriority>(['low', 'medium', 'high'], r.priority, 'medium'),
    isRead: fromDbBool(r.is_read),
    readAt: fromDbTimeOrNull(r.read_at),
    data: parseJsonObject(r.data),
    createdAt: fromDbTime(r.created_at),
  }
}

/** Note what is NOT mapped: password_encrypted never leaves routerRepository. */
export function rowToRouterConfig(r: Omit<RouterConfigRow, 'password_encrypted'> & { password_encrypted?: string }): RouterConfig {
  return {
    id: r.id,
    routerType: oneOf<RouterType>(ROUTER_TYPES, r.router_type, 'generic'),
    routerName: r.router_name,
    routerIp: r.router_ip,
    port: Number(r.port),
    username: r.username,
    hasPassword: true,
    macAddress: r.mac_address,
    modelNumber: r.model_number,
    firmwareVersion: r.firmware_version,
    isConnected: fromDbBool(r.is_connected),
    lastCheckAt: fromDbTimeOrNull(r.last_check_at),
    lastSuccessAt: fromDbTimeOrNull(r.last_success_at),
    createdAt: fromDbTime(r.created_at),
    updatedAt: fromDbTime(r.updated_at),
  }
}

export function rowToNetworkMetric(r: NetworkMetricRow): NetworkMetric {
  return {
    id: r.id,
    timestamp: fromDbTime(r.timestamp),
    totalBandwidthUp: Number(r.total_bandwidth_up),
    totalBandwidthDown: Number(r.total_bandwidth_down),
    activeDevices: Number(r.active_devices),
    onlineDevices: Number(r.online_devices),
    peakBandwidthUp: Number(r.peak_bandwidth_up),
    peakBandwidthDown: Number(r.peak_bandwidth_down),
  }
}

export function rowToScanHistory(r: ScanHistoryRow): ScanHistory {
  const status = r.status === 'success' || r.status === 'partial' ? r.status : 'failed'
  return {
    id: r.id,
    scannerName: r.scanner_name,
    scanDurationMs: Number(r.scan_duration),
    deviceCount: Number(r.device_count),
    successCount: Number(r.success_count),
    failureCount: Number(r.failure_count),
    status,
    errorMessage: r.error_message,
    createdAt: fromDbTime(r.created_at),
  }
}
