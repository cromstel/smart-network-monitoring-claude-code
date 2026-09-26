/**
 * Zod schemas shared by route handlers and forms: one definition validates the API
 * boundary and the UI (ARCHITECTURE §3). Pure — safe to import from client components.
 */
import { z } from 'zod'
import { DEVICE_TYPES } from '@/lib/types/device'
import { ALERT_TYPES } from '@/lib/types/alert'
import { ROLES } from '@/lib/types/user'
import { ROUTER_TYPES } from '@/lib/types/router'
import { isValidCidr, isValidIpv4 } from '@/lib/utils/network'

const boolParam = z.enum(['true', 'false']).transform((v) => v === 'true')
const page = z.coerce.number().int().min(1).default(1)
const pageSize = z.coerce.number().int().min(1, 'pageSize must be between 1 and 100.').max(100, 'pageSize must be between 1 and 100.').default(50)
export const rangeSchema = z.enum(['1h', '24h', '7d', '30d'])

export const deviceListQuery = z.object({
  status: z.enum(['online', 'offline', 'idle']).optional(),
  type: z.enum(DEVICE_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  includeIgnored: boolParam.optional(),
  sort: z.enum(['name', 'lastSeen', 'bandwidth']).default('lastSeen'),
  order: z.enum(['asc', 'desc']).optional(),
  page,
  pageSize,
})

export const devicePatchBody = z
  .object({
    deviceName: z.string().trim().max(255).nullable().optional(),
    deviceType: z.enum(DEVICE_TYPES).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    isIgnored: z.boolean().optional(),
  })
  .strict()

export const bandwidthQuery = z
  .object({
    range: rangeSchema.default('24h'),
    resolution: z.enum(['raw', 'hourly']).optional(),
  })
  .refine((q) => !(q.range === '30d' && q.resolution === 'raw'), {
    message: '30d at raw resolution is unbounded; use resolution=hourly.',
    path: ['resolution'],
  })

export const topConsumersQuery = z.object({
  range: rangeSchema.default('24h'),
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

export const alertCreateBody = z
  .object({
    alertType: z.enum(ALERT_TYPES),
    deviceId: z.string().uuid().nullable().default(null),
    threshold: z.number().positive().max(100_000).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((b) => b.alertType !== 'bandwidth_exceeded' || (b.threshold !== null && b.threshold !== undefined), {
    message: 'threshold is required for bandwidth_exceeded.',
    path: ['threshold'],
  })

export const alertPatchBody = z
  .object({
    deviceId: z.string().uuid().nullable().optional(),
    threshold: z.number().positive().max(100_000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()

export const alertListQuery = z.object({ scope: z.enum(['mine', 'all']).default('mine') })

export const notificationListQuery = z.object({
  isRead: boolParam.optional(),
  type: z.enum(['info', 'success', 'warning', 'error']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page,
  pageSize,
})

export const notificationPatchBody = z.object({ isRead: z.boolean() }).strict()

const password = z.string().min(10, 'Use at least 10 characters.').max(200)
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(255)

export const loginBody = z.object({ email: z.string().trim().max(255), password: z.string().max(200) })

export const setupBody = z
  .object({
    email,
    password,
    name: z.string().trim().max(255).nullable().optional(),
  })
  .strict()

export const userCreateBody = z
  .object({ email, password, name: z.string().trim().max(255).nullable().optional(), role: z.enum(ROLES).default('VIEWER') })
  .strict()

export const userPatchBody = z
  .object({ name: z.string().trim().max(255).nullable().optional(), role: z.enum(ROLES).optional(), isActive: z.boolean().optional(), password: password.optional() })
  .strict()

export const changePasswordBody = z.object({ currentPassword: z.string().max(200), newPassword: password }).strict()

const cidr = z.string().trim().refine(isValidCidr, 'Enter an IPv4 CIDR such as 192.168.1.0/24.')

export const settingsPatchBody = z
  .object({
    scanIntervalSeconds: z.number().int().min(30).max(3600).optional(),
    dataRetentionDays: z.number().int().min(1).max(365).optional(),
    networkSubnet: cidr.optional(),
    ignoreSubnets: z.array(cidr).max(20).optional(),
    notifyNewDevices: z.boolean().optional(),
    notifyDeviceOffline: z.boolean().optional(),
    notifyHighBandwidth: z.boolean().optional(),
    bandwidthThreshold: z.number().positive().max(100_000).optional(),
    theme: z.enum(['dark', 'light', 'system']).optional(),
  })
  .strict()

const host = z.string().trim().refine(isValidIpv4, 'Enter the router’s IPv4 address.')

export const routerConfigBody = z
  .object({
    routerType: z.enum(ROUTER_TYPES),
    routerName: z.string().trim().max(255).nullable().optional(),
    routerIp: host,
    port: z.number().int().min(1).max(65535).default(80),
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(255).optional(),
  })
  .strict()

export const routerTestBody = routerConfigBody.partial().strict()
