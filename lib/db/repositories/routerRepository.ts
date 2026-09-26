/**
 * One router per installation. `password_encrypted` is read in exactly one function
 * (`findEncryptedCredentials`), used only by routerService at the moment of use.
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { nowDb, toDbBool } from '../time'
import type { RouterConfig, RouterType } from '@/lib/types'
import { rowToRouterConfig } from './mappers'

const PUBLIC_COLUMNS = [
  'id',
  'router_type',
  'router_name',
  'router_ip',
  'port',
  'username',
  'mac_address',
  'model_number',
  'firmware_version',
  'is_connected',
  'last_check_at',
  'last_success_at',
  'created_at',
  'updated_at',
] as const

export async function find(): Promise<RouterConfig | null> {
  const row = await getDb().selectFrom('router_config').select(PUBLIC_COLUMNS).orderBy('created_at', 'asc').executeTakeFirst()
  return row ? rowToRouterConfig(row) : null
}

export async function findEncryptedCredentials(): Promise<{
  routerType: RouterType
  routerIp: string
  port: number
  username: string
  passwordEncrypted: string
} | null> {
  const row = await getDb()
    .selectFrom('router_config')
    .select(['router_type', 'router_ip', 'port', 'username', 'password_encrypted', 'created_at'])
    .orderBy('created_at', 'asc')
    .executeTakeFirst()
  if (!row) return null
  const config = rowToRouterConfig({ ...row, id: '', router_name: null, mac_address: null, model_number: null, firmware_version: null, is_connected: 0, last_check_at: null, last_success_at: null, updated_at: row.created_at })
  return {
    routerType: config.routerType,
    routerIp: row.router_ip,
    port: Number(row.port),
    username: row.username,
    passwordEncrypted: row.password_encrypted,
  }
}

export async function save(input: {
  routerType: RouterType
  routerName: string | null
  routerIp: string
  port: number
  username: string
  passwordEncrypted: string | null // null = keep the stored one
}): Promise<RouterConfig> {
  const db = getDb()
  const now = nowDb()
  const existing = await find()
  if (existing) {
    await db
      .updateTable('router_config')
      .set({
        router_type: input.routerType,
        router_name: input.routerName,
        router_ip: input.routerIp,
        port: input.port,
        username: input.username,
        ...(input.passwordEncrypted ? { password_encrypted: input.passwordEncrypted } : {}),
        is_connected: 0,
        updated_at: now,
      })
      .where('id', '=', existing.id)
      .execute()
  } else {
    if (!input.passwordEncrypted) throw new Error('password is required when creating the router configuration')
    await db
      .insertInto('router_config')
      .values({
        id: randomUUID(),
        router_type: input.routerType,
        router_name: input.routerName,
        router_ip: input.routerIp,
        port: input.port,
        username: input.username,
        password_encrypted: input.passwordEncrypted,
        created_at: now,
        updated_at: now,
      })
      .execute()
  }
  const saved = await find()
  if (!saved) throw new Error('router config did not persist')
  return saved
}

export async function recordCheck(result: {
  reachable: boolean
  modelNumber?: string | null
  firmwareVersion?: string | null
  macAddress?: string | null
}): Promise<void> {
  const now = nowDb()
  await getDb()
    .updateTable('router_config')
    .set({
      is_connected: toDbBool(result.reachable),
      last_check_at: now,
      ...(result.reachable ? { last_success_at: now } : {}),
      ...(result.modelNumber ? { model_number: result.modelNumber } : {}),
      ...(result.firmwareVersion ? { firmware_version: result.firmwareVersion } : {}),
      ...(result.macAddress ? { mac_address: result.macAddress } : {}),
      updated_at: now,
    })
    .execute()
}

export async function remove(): Promise<void> {
  await getDb().deleteFrom('router_config').execute()
}
