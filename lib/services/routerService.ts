/**
 * Router configuration and connectivity. The only module that decrypts the router password,
 * and only at the moment of use (ARCHITECTURE §8). No function here returns the password.
 */
import { getConfig as getAppConfig } from '@/lib/config'
import * as routerRepo from '@/lib/db/repositories/routerRepository'
import * as deviceRepo from '@/lib/db/repositories/deviceRepository'
import { AppError, notFound } from '@/lib/api/errors'
import { decrypt, encrypt } from '@/lib/security/encryption'
import type { RouterConfig, RouterCredentials, RouterType } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { AsusClient, RouterHttpError, type RouterInfo } from './router/asusClient'
import { publish } from './eventBus'

export interface RouterConfigInput {
  routerType: RouterType
  routerName?: string | null
  routerIp: string
  port: number
  username: string
  password?: string
}

export async function getConfig(): Promise<RouterConfig | null> {
  return routerRepo.find()
}

export async function saveConfig(input: RouterConfigInput): Promise<RouterConfig> {
  const existing = await routerRepo.find()
  if (!existing && !input.password) {
    throw new AppError('INVALID_BODY', 'A password is required the first time the router is configured.', {
      fieldErrors: { password: ['Required'] },
    })
  }
  const saved = await routerRepo.save({
    routerType: input.routerType,
    routerName: input.routerName ?? null,
    routerIp: input.routerIp,
    port: input.port,
    username: input.username,
    passwordEncrypted: input.password ? encrypt(input.password, getAppConfig().ENCRYPTION_KEY) : null,
  })
  statusCache = null
  publish('router.changed', {})
  logger.info({ routerType: saved.routerType, routerIp: saved.routerIp }, 'router configuration saved')
  return saved
}

export async function loadCredentials(): Promise<RouterCredentials | null> {
  const stored = await routerRepo.findEncryptedCredentials()
  if (!stored) return null
  try {
    return {
      routerType: stored.routerType,
      routerIp: stored.routerIp,
      port: stored.port,
      username: stored.username,
      password: decrypt(stored.passwordEncrypted, getAppConfig().ENCRYPTION_KEY),
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : 'decrypt failed' }, 'router credentials could not be decrypted (was ENCRYPTION_KEY changed?)')
    return null
  }
}

export interface ConnectionTestResult {
  reachable: boolean
  modelNumber: string | null
  firmwareVersion: string | null
  message: string
}

async function probe(creds: RouterCredentials): Promise<ConnectionTestResult & { info?: RouterInfo }> {
  if (creds.routerType === 'asus') {
    try {
      const client = new AsusClient(creds)
      await client.login()
      const info = await client.getInfo()
      return { reachable: true, modelNumber: info.modelNumber, firmwareVersion: info.firmwareVersion, message: 'Connected.', info }
    } catch (err) {
      const kind = err instanceof RouterHttpError ? err.kind : 'unreachable'
      const message =
        kind === 'auth' ? 'The router rejected the username or password.' : kind === 'protocol' ? 'The device answered, but not like an ASUS router.' : 'The router did not respond.'
      return { reachable: false, modelNumber: null, firmwareVersion: null, message }
    }
  }
  // tplink / netgear / generic: no API client in v1.0 (PRD F-45 is P2) — reachability only.
  try {
    const scheme = creds.port === 443 ? 'https' : 'http'
    await fetch(`${scheme}://${creds.routerIp}:${creds.port}/`, { method: 'GET', signal: AbortSignal.timeout(4000), redirect: 'manual' })
    return { reachable: true, modelNumber: null, firmwareVersion: null, message: 'Reachable. Device discovery for this router type is not supported yet; ARP is used.' }
  } catch {
    return { reachable: false, modelNumber: null, firmwareVersion: null, message: 'The router did not respond.' }
  }
}

/** Tests submitted credentials, or the stored ones. A submitted config without password reuses the stored password. */
export async function testConnection(input?: Partial<RouterConfigInput>): Promise<ConnectionTestResult> {
  const stored = await loadCredentials()
  let creds: RouterCredentials | null = null
  if (input?.routerIp && input.routerType && input.username !== undefined) {
    const password = input.password ?? stored?.password
    if (password === undefined) {
      throw new AppError('INVALID_BODY', 'A password is required to test a new router.', { fieldErrors: { password: ['Required'] } })
    }
    creds = { routerType: input.routerType, routerIp: input.routerIp, port: input.port ?? 80, username: input.username, password }
  } else {
    creds = stored
  }
  if (!creds) throw notFound('Router configuration')

  const result = await probe(creds)
  const usingStored = !input?.routerIp || (stored !== null && stored.routerIp === creds.routerIp)
  if (usingStored && stored) {
    await routerRepo.recordCheck({
      reachable: result.reachable,
      modelNumber: result.info?.modelNumber ?? null,
      firmwareVersion: result.info?.firmwareVersion ?? null,
      macAddress: result.info?.macAddress ?? null,
    })
    statusCache = null
  }
  return { reachable: result.reachable, modelNumber: result.modelNumber, firmwareVersion: result.firmwareVersion, message: result.message }
}

let statusCache: { at: number; reachable: boolean } | null = null
const STATUS_TTL_MS = 30_000

export interface RouterStatus {
  configured: boolean
  reachable: boolean
  config: RouterConfig | null
}

export async function getStatus(): Promise<RouterStatus> {
  const config = await routerRepo.find()
  if (!config) return { configured: false, reachable: false, config: null }
  if (!statusCache || Date.now() - statusCache.at > STATUS_TTL_MS) {
    const creds = await loadCredentials()
    const result = creds ? await probe(creds) : { reachable: false, info: undefined }
    await routerRepo.recordCheck({ reachable: result.reachable, modelNumber: result.info?.modelNumber ?? null, firmwareVersion: result.info?.firmwareVersion ?? null })
    statusCache = { at: Date.now(), reachable: result.reachable }
  }
  const fresh = await routerRepo.find()
  return { configured: true, reachable: statusCache.reachable, config: fresh }
}

/** F-44 is P2: no v1.0 router client can block. The route exists so the contract is stable. */
export async function setBlocked(deviceId: string, blocked: boolean): Promise<never> {
  const device = await deviceRepo.findById(deviceId)
  if (!device) throw notFound('Device')
  const config = await routerRepo.find()
  if (!config) throw new AppError('ROUTER_UNSUPPORTED', 'Configure a router before blocking devices.')
  logger.info({ deviceId, blocked, routerType: config.routerType }, 'block requested but unsupported by router client')
  throw new AppError('ROUTER_UNSUPPORTED', `Blocking devices is not supported for '${config.routerType}' routers in this version.`)
}

export function resetStatusCacheForTests(): void {
  statusCache = null
}
