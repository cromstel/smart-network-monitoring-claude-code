/**
 * ARP discovery. Two strategies, chosen by a capability probe before first use (AUDIT A-16):
 *
 *   arp-scan   Linux, `arp-scan` installed, and CAP_NET_RAW (or root). Active and complete.
 *              In Docker: `--cap-add=NET_RAW` plus `network_mode: host`.
 *   arp-cache  Any OS with `ip` or `arp`. A parallel ping sweep populates the OS neighbour
 *              table, which is then read. Needs no privileges; slightly less complete
 *              (devices that drop ICMP and never talk to this host can be missed).
 *
 * ARP sees presence only — it cannot measure per-device traffic, so it reports no counters.
 */
import { execFile } from 'node:child_process'
import { promises as dns } from 'node:dns'
import fs from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'
import { cidrHosts, ipInCidr, isUnicastMac, isValidCidr, normalizeMac } from '@/lib/utils/network'
import { logger } from '@/lib/utils/logger'
import type { DiscoveredDevice, Scanner } from './types'

const run = promisify(execFile)

type Strategy = 'arp-scan' | 'arp-cache'

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [cmd], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

/** CAP_NET_RAW is capability bit 13 in the effective set. */
export function hasNetRaw(statusText: string | null, uid: number | null): boolean {
  if (uid === 0) return true
  if (!statusText) return false
  const match = /^CapEff:\s*([0-9a-f]+)$/im.exec(statusText)
  if (!match?.[1]) return false
  return (BigInt(`0x${match[1]}`) & (BigInt(1) << BigInt(13))) !== BigInt(0)
}

/** Parses `arp-scan --plain` output: "192.168.1.1\taa:bb:cc:dd:ee:ff\tVendor". */
export function parseArpScan(output: string): { ip: string; mac: string }[] {
  const out: { ip: string; mac: string }[] = []
  for (const line of output.split(/\r?\n/)) {
    const [ip, mac] = line.trim().split(/\s+/)
    const normalized = mac ? normalizeMac(mac) : null
    if (ip && normalized) out.push({ ip, mac: normalized })
  }
  return out
}

/**
 * Parses the OS neighbour table:
 *   Linux  `ip neigh`: "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
 *   Windows `arp -a`:  "  192.168.1.1          aa-bb-cc-dd-ee-ff     dynamic"
 *   macOS   `arp -a`:  "? (192.168.1.1) at a:bb:cc:d:ee:ff on en0 ifscope [ethernet]"
 */
export function parseNeighbourTable(output: string): { ip: string; mac: string }[] {
  const out: { ip: string; mac: string }[] = []
  const ipRe = /(\d{1,3}(?:\.\d{1,3}){3})/
  const macRe = /([0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5})/i
  for (const line of output.split(/\r?\n/)) {
    if (/FAILED|INCOMPLETE|\(incomplete\)/i.test(line)) continue
    const ip = ipRe.exec(line)?.[1]
    const mac = macRe.exec(line)?.[1]
    const normalized = mac ? normalizeMac(mac) : null
    if (ip && normalized) out.push({ ip, mac: normalized })
  }
  return out
}

async function reverseLookup(ip: string, timeoutMs = 1000): Promise<string | undefined> {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
    ])
    const name = names[0]
    return name ? name.replace(/\.(local|lan|home|localdomain)\.?$/i, '').replace(/\.$/, '') : undefined
  } catch {
    return undefined
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export class ArpScanner implements Scanner {
  readonly name = 'arp' as const
  private strategy: Strategy | null = null
  private reason: string | null = null
  private probed = false

  async isAvailable(): Promise<boolean> {
    if (this.probed) return this.strategy !== null
    this.probed = true
    try {
      if (process.platform === 'linux' && (await commandExists('arp-scan'))) {
        let status: string | null = null
        try {
          status = fs.readFileSync('/proc/self/status', 'utf8')
        } catch {
          status = null
        }
        const uid = typeof process.getuid === 'function' ? process.getuid() : null
        if (hasNetRaw(status, uid)) {
          this.strategy = 'arp-scan'
          return true
        }
        logger.info({ scanner: 'arp' }, 'arp-scan present but CAP_NET_RAW missing; using the OS neighbour table instead')
      }
      if ((await commandExists('ip')) || (await commandExists('arp'))) {
        this.strategy = 'arp-cache'
        return true
      }
      this.reason = 'neither arp-scan (with CAP_NET_RAW) nor ip/arp is available'
      return false
    } catch (err) {
      this.reason = err instanceof Error ? err.message : 'capability probe failed'
      return false
    }
  }

  unavailableReason(): string | null {
    return this.reason
  }

  get activeStrategy(): Strategy | null {
    return this.strategy
  }

  async scan(subnet: string): Promise<DiscoveredDevice[]> {
    if (!isValidCidr(subnet)) throw new Error(`invalid subnet ${subnet}`)
    if (!(await this.isAvailable()) || !this.strategy) throw new Error(this.reason ?? 'ARP scanner unavailable')

    const pairs = this.strategy === 'arp-scan' ? await this.arpScan(subnet) : await this.arpCache(subnet)
    const byMac = new Map<string, { ip: string; mac: string }>()
    for (const p of pairs) if (ipInCidr(p.ip, subnet) && isUnicastMac(p.mac) && !byMac.has(p.mac)) byMac.set(p.mac, p)

    const localMacs = new Set(
      Object.values(os.networkInterfaces())
        .flat()
        .map((i) => (i?.mac ? normalizeMac(i.mac) : null))
        .filter((m): m is string => m !== null),
    )
    const entries = [...byMac.values()].filter((p) => !localMacs.has(p.mac))
    return mapLimit(entries, 16, async (p) => {
      const hostname = await reverseLookup(p.ip)
      return { macAddress: p.mac, ipAddress: p.ip, ...(hostname ? { hostname } : {}) }
    })
  }

  private async arpScan(subnet: string) {
    const { stdout } = await run('arp-scan', ['--quiet', '--plain', '--retry=2', subnet], { timeout: 25_000, maxBuffer: 4 << 20 })
    return parseArpScan(stdout)
  }

  private async arpCache(subnet: string) {
    await this.pingSweep(subnet)
    if (process.platform === 'linux' && (await commandExists('ip'))) {
      const { stdout } = await run('ip', ['neigh', 'show'], { timeout: 5000 })
      return parseNeighbourTable(stdout)
    }
    const { stdout } = await run('arp', ['-a'], { timeout: 5000 })
    return parseNeighbourTable(stdout)
  }

  /** One ICMP echo per host, 64 in flight. A /24 completes in a few seconds. */
  private async pingSweep(subnet: string): Promise<void> {
    const hosts = cidrHosts(subnet, 1024)
    const args = (ip: string) =>
      process.platform === 'win32' ? ['-n', '1', '-w', '700', ip] : process.platform === 'darwin' ? ['-c', '1', '-t', '1', ip] : ['-c', '1', '-W', '1', ip]
    await mapLimit(hosts, 64, async (ip) => {
      try {
        await run('ping', args(ip), { timeout: 2500 })
      } catch {
        // no reply is the common case
      }
    })
  }
}
