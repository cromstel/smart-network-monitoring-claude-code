/**
 * Settings are stored per user (DATABASE.md user_settings) but split into two kinds:
 *   - network settings (interval, retention, subnet, ignored subnets) describe the one monitored
 *     network: ADMIN-only to change, and kept identical on every row;
 *   - personal settings (notification toggles, threshold, theme) belong to the caller.
 */
import { getConfig } from '@/lib/config'
import * as settingsRepo from '@/lib/db/repositories/settingsRepository'
import { forbidden } from '@/lib/api/errors'
import type { NetworkSettings, Role, Theme, UserSettings } from '@/lib/types'
import { publish } from './eventBus'

export const DEFAULT_RETENTION_DAYS = 30

export function envNetworkDefaults(): NetworkSettings {
  const cfg = getConfig()
  return {
    scanIntervalSeconds: cfg.SCAN_INTERVAL_SECONDS,
    dataRetentionDays: DEFAULT_RETENTION_DAYS,
    networkSubnet: cfg.NETWORK_SUBNET,
    ignoreSubnets: [],
  }
}

export async function getNetworkSettings(): Promise<NetworkSettings> {
  return (await settingsRepo.findAnyNetworkSettings()) ?? envNetworkDefaults()
}

export async function getForUser(userId: string): Promise<UserSettings> {
  const existing = await settingsRepo.findForUser(userId)
  if (existing) return existing
  await settingsRepo.createForUser(userId, await getNetworkSettings())
  const created = await settingsRepo.findForUser(userId)
  if (!created) throw new Error('settings row did not persist')
  return created
}

export interface SettingsPatch {
  scanIntervalSeconds?: number
  dataRetentionDays?: number
  networkSubnet?: string
  ignoreSubnets?: string[]
  notifyNewDevices?: boolean
  notifyDeviceOffline?: boolean
  notifyHighBandwidth?: boolean
  bandwidthThreshold?: number
  theme?: Theme
}

const NETWORK_KEYS = ['scanIntervalSeconds', 'dataRetentionDays', 'networkSubnet', 'ignoreSubnets'] as const

export async function update(user: { id: string; role: Role }, patch: SettingsPatch): Promise<UserSettings> {
  const current = await getForUser(user.id)
  const network: Partial<NetworkSettings> = {}
  for (const key of NETWORK_KEYS) {
    const value = patch[key]
    if (value === undefined) continue
    const unchanged = JSON.stringify(value) === JSON.stringify(current[key])
    if (unchanged) continue
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can change network-wide settings.')
    Object.assign(network, { [key]: value })
  }
  await settingsRepo.updatePersonal(user.id, {
    notifyNewDevices: patch.notifyNewDevices,
    notifyDeviceOffline: patch.notifyDeviceOffline,
    notifyHighBandwidth: patch.notifyHighBandwidth,
    bandwidthThreshold: patch.bandwidthThreshold,
    theme: patch.theme,
  })
  if (Object.keys(network).length > 0) {
    await settingsRepo.updateNetworkForAll(network)
    // Picked up by the scheduler: a new interval takes effect without a restart (PRD F-50).
    publish('settings.changed', { ...network })
  }
  return getForUser(user.id)
}
