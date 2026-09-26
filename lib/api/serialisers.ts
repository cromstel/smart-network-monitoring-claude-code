/**
 * Domain -> wire. The only place Dates become ISO strings and byte counts become
 * { bytes: string, megabytes: number }. Secrets have no field to land in.
 */
import type {
  AlertRuleDTO,
  BandwidthPoint,
  BandwidthPointDTO,
  CategoryDTO,
  ConnectionLog,
  ConnectionLogDTO,
  DeviceAlert,
  DeviceCategory,
  DeviceDTO,
  DeviceDetailDTO,
  Notification,
  NotificationDTO,
  RouterConfig,
  RouterConfigDTO,
  SettingsDTO,
  TopConsumerDTO,
  User,
  UserDTO,
  UserSettings,
} from '@/lib/types'
import type { DeviceDetail, DeviceView } from '@/lib/services/deviceService'
import type { TopConsumer } from '@/lib/services/bandwidthService'
import { bytesToMegabytes, displayName } from '@/lib/utils/format'

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

export function toDeviceDTO(d: DeviceView): DeviceDTO {
  return {
    id: d.id,
    macAddress: d.macAddress,
    ipAddress: d.ipAddress,
    hostname: d.hostname,
    deviceName: d.deviceName,
    displayName: displayName(d),
    deviceType: d.deviceType,
    manufacturer: d.manufacturer,
    status: d.status,
    signalStrength: d.signalStrength,
    firstSeen: d.firstSeen.toISOString(),
    lastSeen: d.lastSeen.toISOString(),
    totalConnectionTimeSeconds: d.totalConnectionTimeSeconds,
    isBlocked: d.isBlocked,
    isIgnored: d.isIgnored,
    isUnknown: d.isUnknown,
    categoryId: d.categoryId,
    currentBandwidth: d.currentBandwidth,
    totalTransferred: {
      uploadBytes: d.totalTransferred.uploadBytes,
      downloadBytes: d.totalTransferred.downloadBytes,
      uploadMegabytes: bytesToMegabytes(d.totalTransferred.uploadBytes),
      downloadMegabytes: bytesToMegabytes(d.totalTransferred.downloadBytes),
    },
  }
}

export function toCategoryDTO(c: DeviceCategory): CategoryDTO {
  return { id: c.id, name: c.name, color: c.color, icon: c.icon, description: c.description }
}

export function toConnectionLogDTO(l: ConnectionLog): ConnectionLogDTO {
  return {
    id: l.id,
    eventType: l.eventType,
    timestamp: l.timestamp.toISOString(),
    ipAddress: l.ipAddress,
    connectionDurationSeconds: l.connectionDurationSeconds,
  }
}

export function toDeviceDetailDTO(d: DeviceDetail): DeviceDetailDTO {
  return {
    ...toDeviceDTO(d),
    category: d.category ? toCategoryDTO(d.category) : null,
    connectionLogs: d.connectionLogs.map(toConnectionLogDTO),
    stats: d.stats,
  }
}

export function toPointDTO(p: BandwidthPoint): BandwidthPointDTO {
  return {
    timestamp: p.timestamp.toISOString(),
    uploadMbps: p.uploadMbps,
    downloadMbps: p.downloadMbps,
    uploadBytes: p.uploadBytes,
    downloadBytes: p.downloadBytes,
  }
}

export function toTopConsumerDTO(t: TopConsumer): TopConsumerDTO {
  return {
    deviceId: t.device.id,
    displayName: displayName(t.device),
    deviceType: t.device.deviceType,
    status: t.device.status,
    uploadBytes: t.uploadBytes,
    downloadBytes: t.downloadBytes,
    totalBytes: t.totalBytes,
    totalMegabytes: bytesToMegabytes(t.totalBytes),
  }
}

export function toAlertRuleDTO(a: DeviceAlert): AlertRuleDTO {
  return {
    id: a.id,
    userId: a.userId,
    deviceId: a.deviceId,
    alertType: a.alertType,
    threshold: a.threshold,
    isActive: a.isActive,
    lastTriggered: iso(a.lastTriggered),
    triggerCount: a.triggerCount,
    createdAt: a.createdAt.toISOString(),
  }
}

export function toNotificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    deviceId: n.deviceId,
    alertId: n.alertId,
    title: n.title,
    message: n.message,
    type: n.type,
    priority: n.priority,
    isRead: n.isRead,
    readAt: iso(n.readAt),
    data: n.data,
    createdAt: n.createdAt.toISOString(),
  }
}

/** Deliberately enumerates fields: a future column on User cannot leak by accident. */
export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  }
}

export function toSettingsDTO(s: UserSettings): SettingsDTO {
  return {
    scanIntervalSeconds: s.scanIntervalSeconds,
    dataRetentionDays: s.dataRetentionDays,
    networkSubnet: s.networkSubnet,
    ignoreSubnets: s.ignoreSubnets,
    notifyNewDevices: s.notifyNewDevices,
    notifyDeviceOffline: s.notifyDeviceOffline,
    notifyHighBandwidth: s.notifyHighBandwidth,
    bandwidthThreshold: s.bandwidthThreshold,
    theme: s.theme,
  }
}

/** No password field exists on the DTO — not plaintext, not encrypted (AUDIT A-09). */
export function toRouterConfigDTO(r: RouterConfig): RouterConfigDTO {
  return {
    id: r.id,
    routerType: r.routerType,
    routerName: r.routerName,
    routerIp: r.routerIp,
    port: r.port,
    username: r.username,
    hasPassword: r.hasPassword,
    modelNumber: r.modelNumber,
    firmwareVersion: r.firmwareVersion,
    isConnected: r.isConnected,
    lastCheckAt: iso(r.lastCheckAt),
    lastSuccessAt: iso(r.lastSuccessAt),
  }
}
