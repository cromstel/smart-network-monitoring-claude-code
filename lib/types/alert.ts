export const ALERT_TYPES = ['unknown_device', 'bandwidth_exceeded', 'device_offline'] as const
export type AlertType = (typeof ALERT_TYPES)[number]

/** A rule, owned by exactly one user (PRD F-34). */
export interface DeviceAlert {
  id: string
  userId: string
  deviceId: string | null // null = applies to all devices
  alertType: AlertType
  threshold: number | null // Mbps, bandwidth_exceeded only
  isActive: boolean
  lastTriggered: Date | null
  triggerCount: number
  createdAt: Date
  updatedAt: Date
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error'
export type NotificationPriority = 'low' | 'medium' | 'high'

/** An alert instance delivered to one user. */
export interface Notification {
  id: string
  userId: string
  deviceId: string | null
  alertId: string | null
  title: string
  message: string
  type: NotificationType
  priority: NotificationPriority
  isRead: boolean
  readAt: Date | null
  data: Record<string, unknown> | null
  createdAt: Date
}
