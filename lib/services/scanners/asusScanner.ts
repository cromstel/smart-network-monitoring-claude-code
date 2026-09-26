import type { RouterCredentials } from '@/lib/types'
import { AsusClient } from '../router/asusClient'
import type { DiscoveredDevice, Scanner } from './types'

/**
 * Router-API discovery. Presence, hostname and RSSI come from the router's client list.
 * AsusWRT does not expose per-client byte counters without its traffic analyser, so this
 * scanner reports none rather than estimating them.
 */
export class AsusScanner implements Scanner {
  readonly name = 'asus' as const
  private reason: string | null = null

  constructor(private readonly loadCredentials: () => Promise<RouterCredentials | null>) {}

  async isAvailable(): Promise<boolean> {
    const creds = await this.loadCredentials()
    if (!creds) {
      this.reason = 'no router is configured'
      return false
    }
    if (creds.routerType !== 'asus') {
      this.reason = `router type '${creds.routerType}' has no client in v1.0`
      return false
    }
    try {
      await new AsusClient(creds).login()
      this.reason = null
      return true
    } catch (err) {
      this.reason = err instanceof Error ? err.message : 'router login failed'
      return false
    }
  }

  unavailableReason(): string | null {
    return this.reason
  }

  async scan(): Promise<DiscoveredDevice[]> {
    const creds = await this.loadCredentials()
    if (!creds) throw new Error('no router is configured')
    const clients = await new AsusClient(creds).getClients()
    return clients
      .filter((c) => c.online)
      .map((c) => ({
        macAddress: c.mac,
        ipAddress: c.ip,
        ...(c.name ? { hostname: c.name } : {}),
        ...(c.rssi !== null ? { signalStrength: c.rssi } : {}),
      }))
  }
}
