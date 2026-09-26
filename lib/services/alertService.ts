/**
 * Alert engine (PRD F-30…F-34).
 *
 * Two sources can decide that a user should hear about an event:
 *   1. Rules (device_alerts) — explicit, owned by one user, optionally for one device.
 *   2. Built-in alerts from that user's own settings: notifyNewDevices, notifyDeviceOffline,
 *      notifyHighBandwidth + bandwidthThreshold.
 *
 * Every notification is created for exactly one recipient: the owner of the rule or of the
 * settings row that matched. Recipients are collected per user, so a user matched by both a
 * rule and a toggle gets one notification, and a user matched by neither gets nothing.
 * A cross-user leak shipped on a related project; see __tests__/integration/alertOwnership.test.ts.
 */
import * as alertRepo from '@/lib/db/repositories/alertRepository'
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import * as settingsRepo from '@/lib/db/repositories/settingsRepository'
import * as userRepo from '@/lib/db/repositories/userRepository'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import { forbidden, notFound, AppError } from '@/lib/api/errors'
import type { AlertType, Device, DeviceAlert, Notification, NotificationPriority, NotificationType, Role } from '@/lib/types'
import { displayName, formatMbps } from '@/lib/utils/format'
import { logger } from '@/lib/utils/logger'
import { publish } from './eventBus'

/** A bandwidth alert for the same device and source re-fires at most this often. */
export const BANDWIDTH_COOLDOWN_MS = 15 * 60_000
/** Guards against a double scan or a flapping device raising the same event twice. */
const EVENT_DEDUP_MS = 60_000

interface Recipient {
  userId: string
  rule: DeviceAlert | null
  threshold?: number
}

interface Message {
  title: string
  message: string
  type: NotificationType
  priority: NotificationPriority
  kind: AlertType
}

async function deliver(device: Device, recipients: Map<string, Recipient>, build: (r: Recipient) => Message, cooldownMs: number): Promise<Notification[]> {
  const created: Notification[] = []
  const since = new Date(Date.now() - cooldownMs)
  for (const r of recipients.values()) {
    const msg = build(r)
    const duplicate = r.rule
      ? await notificationRepo.existsForAlertSince(r.rule.id, device.id, since)
      : await notificationRepo.existsBuiltInSince(r.userId, device.id, msg.kind, since)
    if (duplicate) continue
    const n = await notificationRepo.create({
      userId: r.userId, // the recipient — never anyone else
      deviceId: device.id,
      alertId: r.rule?.id ?? null,
      title: msg.title,
      message: msg.message,
      type: msg.type,
      priority: msg.priority,
      data: { kind: msg.kind, deviceId: device.id, macAddress: device.macAddress, ...(r.threshold !== undefined ? { threshold: r.threshold } : {}) },
    })
    if (r.rule) await alertRepo.markTriggered(r.rule.id)
    publish('alert.raised', { notificationId: n.id, title: n.title, priority: n.priority }, { userId: r.userId })
    created.push(n)
  }
  if (created.length > 0) logger.info({ deviceId: device.id, recipients: created.length }, 'alerts raised')
  return created
}

/** Users whose built-in toggle `flag` is on. */
async function builtInRecipients(flag: 'notifyNewDevices' | 'notifyDeviceOffline' | 'notifyHighBandwidth'): Promise<{ userId: string; threshold: number }[]> {
  const users = await userRepo.listActive()
  const settings = await settingsRepo.findManyForUsers(users.map((u) => u.id))
  const out: { userId: string; threshold: number }[] = []
  for (const u of users) {
    const s = settings.get(u.id)
    if (s && s[flag]) out.push({ userId: u.id, threshold: s.bandwidthThreshold })
  }
  return out
}

function name(d: Device): string {
  return displayName(d)
}

/** F-30: an unrecognised (unnamed) device has connected for the first time. */
export async function onNewDevice(device: Device): Promise<Notification[]> {
  if (device.isIgnored || device.deviceName !== null) return []
  const recipients = new Map<string, Recipient>()
  for (const rule of await alertRepo.findActiveMatching('unknown_device', device.id)) {
    if (!recipients.has(rule.userId)) recipients.set(rule.userId, { userId: rule.userId, rule })
  }
  for (const b of await builtInRecipients('notifyNewDevices')) {
    if (!recipients.has(b.userId)) recipients.set(b.userId, { userId: b.userId, rule: null })
  }
  if (recipients.size === 0) return []
  return deliver(
    device,
    recipients,
    () => ({
      kind: 'unknown_device',
      title: 'Unknown device connected',
      message: `${device.manufacturer ?? 'Unrecognised vendor'} device ${device.macAddress} joined the network at ${device.ipAddress}${device.hostname ? ` as “${device.hostname}”` : ''}.`,
      type: 'warning',
      priority: 'high',
    }),
    // A MAC is new exactly once; the window only absorbs a racing duplicate scan.
    24 * 3600_000,
  )
}

/** F-32: a device went offline. Built-in alerts cover named devices; a device-specific rule covers any. */
export async function onDeviceOffline(device: Device): Promise<Notification[]> {
  if (device.isIgnored) return []
  const recipients = new Map<string, Recipient>()
  for (const rule of await alertRepo.findActiveMatching('device_offline', device.id)) {
    if (rule.deviceId === null && device.deviceName === null) continue
    if (!recipients.has(rule.userId)) recipients.set(rule.userId, { userId: rule.userId, rule })
  }
  if (device.deviceName !== null) {
    for (const b of await builtInRecipients('notifyDeviceOffline')) {
      if (!recipients.has(b.userId)) recipients.set(b.userId, { userId: b.userId, rule: null })
    }
  }
  if (recipients.size === 0) return []
  return deliver(
    device,
    recipients,
    () => ({
      kind: 'device_offline',
      title: `${name(device)} went offline`,
      message: `${name(device)} (${device.ipAddress}) stopped responding. Last seen ${device.lastSeen.toISOString()}.`,
      type: 'info',
      priority: 'medium',
    }),
    EVENT_DEDUP_MS,
  )
}

/** F-31: combined throughput above the recipient's threshold (rule threshold, else their setting). */
export async function onBandwidthSample(device: Device, uploadMbps: number, downloadMbps: number): Promise<Notification[]> {
  if (device.isIgnored) return []
  const total = uploadMbps + downloadMbps
  const recipients = new Map<string, Recipient>()
  const builtIns = await builtInRecipients('notifyHighBandwidth')
  const settingsThreshold = new Map(builtIns.map((b) => [b.userId, b.threshold]))
  for (const rule of await alertRepo.findActiveMatching('bandwidth_exceeded', device.id)) {
    const threshold = rule.threshold ?? settingsThreshold.get(rule.userId)
    if (threshold === undefined || total <= threshold) continue
    // A device-specific rule is more specific than an all-devices one; keep the first match per user.
    const existing = recipients.get(rule.userId)
    if (!existing || (existing.rule?.deviceId === null && rule.deviceId !== null)) {
      recipients.set(rule.userId, { userId: rule.userId, rule, threshold })
    }
  }
  for (const b of builtIns) {
    if (!recipients.has(b.userId) && total > b.threshold) recipients.set(b.userId, { userId: b.userId, rule: null, threshold: b.threshold })
  }
  if (recipients.size === 0) return []
  return deliver(
    device,
    recipients,
    (r) => ({
      kind: 'bandwidth_exceeded',
      title: `${name(device)} exceeded ${r.threshold ?? 0} Mbps`,
      message: `${name(device)} is using ${formatMbps(total)} (↓ ${formatMbps(downloadMbps)}, ↑ ${formatMbps(uploadMbps)}).`,
      type: 'warning',
      priority: 'medium',
    }),
    BANDWIDTH_COOLDOWN_MS,
  )
}

/** Test-and-API entry point matching TESTING.md: evaluate a bandwidth reading for one device. */
export async function evaluateAlerts(input: { deviceId: string; downloadMbps: number; uploadMbps?: number }): Promise<Notification[]> {
  const device = await deviceRepo.findById(input.deviceId)
  if (!device) throw notFound('Device')
  return onBandwidthSample(device, input.uploadMbps ?? 0, input.downloadMbps)
}

// ---- rule management (owner-scoped) ---------------------------------------------------------

export interface Caller {
  id: string
  role: Role
}

export async function listRules(caller: Caller, scope: 'mine' | 'all'): Promise<DeviceAlert[]> {
  if (scope === 'all') {
    if (caller.role !== 'ADMIN') throw forbidden('Only an admin can list every alert rule.')
    return alertRepo.listAll()
  }
  return alertRepo.listForUser(caller.id)
}

export interface RuleInput {
  alertType: AlertType
  deviceId: string | null
  threshold: number | null
  isActive: boolean
}

async function assertDeviceExists(deviceId: string | null): Promise<void> {
  if (deviceId && !(await deviceRepo.findById(deviceId))) {
    throw new AppError('INVALID_BODY', 'Device does not exist.', { fieldErrors: { deviceId: ['Unknown device'] } })
  }
}

export async function createRule(caller: Caller, input: RuleInput): Promise<DeviceAlert> {
  if (caller.role === 'VIEWER') throw forbidden()
  await assertDeviceExists(input.deviceId)
  return alertRepo.create({
    userId: caller.id, // owner from the session, never from the body
    deviceId: input.deviceId,
    alertType: input.alertType,
    threshold: input.alertType === 'bandwidth_exceeded' ? input.threshold : null,
    isActive: input.isActive,
  })
}

/** A non-owner gets NOT_FOUND, not FORBIDDEN — a 403 would confirm the rule exists. */
async function ownedRule(caller: Caller, id: string): Promise<DeviceAlert> {
  const rule = caller.role === 'ADMIN' ? await alertRepo.findById(id) : await alertRepo.findByIdForUser(id, caller.id)
  if (!rule) throw notFound('Alert rule')
  return rule
}

export async function updateRule(
  caller: Caller,
  id: string,
  patch: { deviceId?: string | null; threshold?: number | null; isActive?: boolean },
): Promise<DeviceAlert> {
  if (caller.role === 'VIEWER') throw forbidden()
  const rule = await ownedRule(caller, id)
  if (patch.deviceId !== undefined) await assertDeviceExists(patch.deviceId)
  if (rule.alertType === 'bandwidth_exceeded' && patch.threshold === null) {
    throw new AppError('INVALID_BODY', 'A bandwidth rule needs a threshold.', { fieldErrors: { threshold: ['Required'] } })
  }
  await alertRepo.update(rule.id, {
    deviceId: patch.deviceId,
    threshold: rule.alertType === 'bandwidth_exceeded' ? patch.threshold : undefined,
    isActive: patch.isActive,
  })
  const updated = await alertRepo.findById(rule.id)
  if (!updated) throw notFound('Alert rule')
  return updated
}

export async function deleteRule(caller: Caller, id: string): Promise<void> {
  if (caller.role === 'VIEWER') throw forbidden()
  const rule = await ownedRule(caller, id)
  await alertRepo.deleteById(rule.id)
}
