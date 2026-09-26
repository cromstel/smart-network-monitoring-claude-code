import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { getDb } from '../client'
import type { DB } from '../schema'
import { nowDb, toDbBool } from '../time'
import type { NetworkSettings, Theme, UserSettings } from '@/lib/types'
import { rowToSettings } from './mappers'

export async function findForUser(userId: string): Promise<UserSettings | null> {
  const row = await getDb().selectFrom('user_settings').selectAll().where('user_id', '=', userId).executeTakeFirst()
  return row ? rowToSettings(row) : null
}

export async function createForUser(userId: string, network: NetworkSettings, exec: Kysely<DB> = getDb()): Promise<void> {
  const now = nowDb()
  await exec
    .insertInto('user_settings')
    .values({
      id: randomUUID(),
      user_id: userId,
      scan_interval_seconds: network.scanIntervalSeconds,
      data_retention_days: network.dataRetentionDays,
      network_subnet: network.networkSubnet,
      ignore_subnets: JSON.stringify(network.ignoreSubnets),
      created_at: now,
      updated_at: now,
    })
    .execute()
}

export interface PersonalSettingsPatch {
  notifyNewDevices?: boolean
  notifyDeviceOffline?: boolean
  notifyHighBandwidth?: boolean
  bandwidthThreshold?: number
  theme?: Theme
}

export async function updatePersonal(userId: string, patch: PersonalSettingsPatch): Promise<void> {
  const set: {
    updated_at: string
    notify_new_devices?: number
    notify_device_offline?: number
    notify_high_bandwidth?: number
    bandwidth_threshold?: number
    theme?: string
  } = { updated_at: nowDb() }
  if (patch.notifyNewDevices !== undefined) set.notify_new_devices = toDbBool(patch.notifyNewDevices)
  if (patch.notifyDeviceOffline !== undefined) set.notify_device_offline = toDbBool(patch.notifyDeviceOffline)
  if (patch.notifyHighBandwidth !== undefined) set.notify_high_bandwidth = toDbBool(patch.notifyHighBandwidth)
  if (patch.bandwidthThreshold !== undefined) set.bandwidth_threshold = patch.bandwidthThreshold
  if (patch.theme !== undefined) set.theme = patch.theme
  await getDb().updateTable('user_settings').set(set).where('user_id', '=', userId).execute()
}

/** Network-wide fields are kept identical on every row: there is one network per installation. */
export async function updateNetworkForAll(patch: Partial<NetworkSettings>): Promise<void> {
  const set: {
    updated_at: string
    scan_interval_seconds?: number
    data_retention_days?: number
    network_subnet?: string
    ignore_subnets?: string
  } = { updated_at: nowDb() }
  if (patch.scanIntervalSeconds !== undefined) set.scan_interval_seconds = patch.scanIntervalSeconds
  if (patch.dataRetentionDays !== undefined) set.data_retention_days = patch.dataRetentionDays
  if (patch.networkSubnet !== undefined) set.network_subnet = patch.networkSubnet
  if (patch.ignoreSubnets !== undefined) set.ignore_subnets = JSON.stringify(patch.ignoreSubnets)
  await getDb().updateTable('user_settings').set(set).execute()
}

export async function findAnyNetworkSettings(): Promise<NetworkSettings | null> {
  const row = await getDb()
    .selectFrom('user_settings')
    .innerJoin('users', 'users.id', 'user_settings.user_id')
    .selectAll('user_settings')
    .orderBy(({ eb }) => eb.case().when('users.role', '=', 'ADMIN').then(0).else(1).end())
    .orderBy('users.created_at', 'asc')
    .executeTakeFirst()
  if (!row) return null
  const s = rowToSettings(row)
  return {
    scanIntervalSeconds: s.scanIntervalSeconds,
    dataRetentionDays: s.dataRetentionDays,
    networkSubnet: s.networkSubnet,
    ignoreSubnets: s.ignoreSubnets,
  }
}

export async function findManyForUsers(userIds: string[]): Promise<Map<string, UserSettings>> {
  if (userIds.length === 0) return new Map()
  const rows = await getDb().selectFrom('user_settings').selectAll().where('user_id', 'in', userIds).execute()
  return new Map(rows.map((r) => [r.user_id, rowToSettings(r)]))
}
