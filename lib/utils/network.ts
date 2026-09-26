/** IPv4 / MAC helpers. Pure functions — no I/O. */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function isValidIpv4(ip: string): boolean {
  return IPV4.test(ip)
}

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
}

export function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
}

export function parseCidr(cidr: string): { network: number; prefix: number } | null {
  const [ip, prefixRaw] = cidr.trim().split('/')
  if (!ip || prefixRaw === undefined || !isValidIpv4(ip) || !/^\d{1,2}$/.test(prefixRaw)) return null
  const prefix = Number(prefixRaw)
  if (prefix < 8 || prefix > 32) return null
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return { network: (ipToInt(ip) & mask) >>> 0, prefix }
}

/** Accepts IPv4 CIDRs from /8 to /32. Larger ranges are refused — a /8 sweep is 16M hosts. */
export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  if (!parsed || !isValidIpv4(ip)) return false
  const mask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0
  return ((ipToInt(ip) & mask) >>> 0) === parsed.network
}

/** Usable host addresses in a subnet (excludes network and broadcast for prefixes < 31). */
export function cidrHosts(cidr: string, max = 4096): string[] {
  const parsed = parseCidr(cidr)
  if (!parsed) return []
  const size = 2 ** (32 - parsed.prefix)
  const start = size > 2 ? parsed.network + 1 : parsed.network
  const end = size > 2 ? parsed.network + size - 2 : parsed.network + size - 1
  const hosts: string[] = []
  for (let n = start; n <= end && hosts.length < max; n++) hosts.push(intToIp(n))
  return hosts
}

/**
 * Normalise a MAC address to uppercase, colon-separated, zero-padded octets.
 * Accepts `a4-83-e7-2c-11-09`, `a4:83:e7:2c:11:9` (macOS drops leading zeros), `a483.e72c.1109`.
 * Returns null for anything that is not 6 octets.
 */
export function normalizeMac(input: string): string | null {
  const raw = input.trim()
  let octets: string[]
  if (/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(raw)) {
    octets = raw.replace(/\./g, '').match(/.{2}/g) ?? []
  } else if (/^[0-9a-f]{12}$/i.test(raw)) {
    octets = raw.match(/.{2}/g) ?? []
  } else {
    octets = raw.split(/[:-]/)
  }
  if (octets.length !== 6 || octets.some((o) => !/^[0-9a-f]{1,2}$/i.test(o))) return null
  return octets.map((o) => o.padStart(2, '0').toUpperCase()).join(':')
}

/** Broadcast, multicast and all-zero MACs are never real devices. */
export function isUnicastMac(mac: string): boolean {
  const normalized = normalizeMac(mac)
  if (!normalized || normalized === '00:00:00:00:00:00' || normalized === 'FF:FF:FF:FF:FF:FF') return false
  const firstOctet = parseInt(normalized.slice(0, 2), 16)
  return (firstOctet & 1) === 0
}

/** Locally administered bit — set on randomised/private Wi-Fi MACs (iOS, Android, Windows). */
export function isRandomizedMac(mac: string): boolean {
  const normalized = normalizeMac(mac)
  if (!normalized) return false
  return (parseInt(normalized.slice(0, 2), 16) & 2) === 2
}
