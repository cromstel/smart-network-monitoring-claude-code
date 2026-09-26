/**
 * The simulated network. This file and simulatedScanner.ts are the ONLY sources of synthetic
 * data in the codebase (AUDIT A-14). The seed script reuses the roster so seeded history and
 * live simulated scans describe the same 12 devices.
 */
import type { DeviceType } from '@/lib/types'

export type Presence =
  | { kind: 'always' }
  | { kind: 'window'; fromHourUtc: number; toHourUtc: number }
  | { kind: 'periodic'; periodMinutes: number; onMinutes: number }

export interface SimulatedDevice {
  macAddress: string
  hostOctet: number
  hostname: string | null
  suggestedName: string | null // used by the seed only; live scans never name devices
  type: DeviceType
  wireless: boolean
  baseDownMbps: number
  baseUpMbps: number
  burstiness: number // 0..1 — probability weight of short heavy-transfer bursts
  presence: Presence
}

export const SIMULATED_ROSTER: SimulatedDevice[] = [
  { macAddress: 'A4:83:E7:2C:11:09', hostOctet: 42, hostname: 'anas-iphone', suggestedName: "Ana's iPhone", type: 'phone', wireless: true, baseDownMbps: 3.5, baseUpMbps: 0.6, burstiness: 0.25, presence: { kind: 'always' } },
  { macAddress: '5C:49:7D:8A:30:C4', hostOctet: 20, hostname: 'samsung-tv', suggestedName: 'Living Room TV', type: 'tv', wireless: true, baseDownMbps: 14, baseUpMbps: 0.4, burstiness: 0.1, presence: { kind: 'window', fromHourUtc: 16, toHourUtc: 23 } },
  { macAddress: '3C:A9:F4:61:D2:7E', hostOctet: 31, hostname: 'work-laptop', suggestedName: 'Work Laptop', type: 'laptop', wireless: true, baseDownMbps: 6, baseUpMbps: 2.2, burstiness: 0.35, presence: { kind: 'always' } },
  { macAddress: '00:D9:D1:4B:77:02', hostOctet: 25, hostname: 'ps5', suggestedName: 'PlayStation 5', type: 'console', wireless: false, baseDownMbps: 9, baseUpMbps: 1.1, burstiness: 0.5, presence: { kind: 'window', fromHourUtc: 17, toHourUtc: 23 } },
  { macAddress: '68:54:FD:C1:05:9A', hostOctet: 51, hostname: 'echo-dot', suggestedName: 'Kitchen Echo', type: 'speaker', wireless: true, baseDownMbps: 0.35, baseUpMbps: 0.08, burstiness: 0.05, presence: { kind: 'always' } },
  { macAddress: '24:A1:60:3E:92:1B', hostOctet: 60, hostname: 'esp-plug-3e921b', suggestedName: null, type: 'iot', wireless: true, baseDownMbps: 0.01, baseUpMbps: 0.01, burstiness: 0, presence: { kind: 'always' } },
  { macAddress: 'DC:A6:32:0F:44:E1', hostOctet: 2, hostname: 'pihole', suggestedName: 'Pi-hole', type: 'server', wireless: false, baseDownMbps: 0.6, baseUpMbps: 0.5, burstiness: 0.05, presence: { kind: 'always' } },
  { macAddress: '3C:52:82:7A:C0:13', hostOctet: 70, hostname: 'hp-laserjet', suggestedName: 'Office Printer', type: 'printer', wireless: true, baseDownMbps: 0.02, baseUpMbps: 0.01, burstiness: 0.02, presence: { kind: 'always' } },
  { macAddress: 'F0:18:98:B2:6D:40', hostOctet: 44, hostname: 'ipad', suggestedName: 'iPad', type: 'tablet', wireless: true, baseDownMbps: 4.5, baseUpMbps: 0.3, burstiness: 0.3, presence: { kind: 'window', fromHourUtc: 6, toHourUtc: 22 } },
  { macAddress: '18:B4:30:9C:21:77', hostOctet: 53, hostname: 'nest-thermostat', suggestedName: 'Thermostat', type: 'iot', wireless: true, baseDownMbps: 0.03, baseUpMbps: 0.02, burstiness: 0, presence: { kind: 'always' } },
  { macAddress: '34:3E:A4:18:6B:D5', hostOctet: 54, hostname: 'ring-doorbell', suggestedName: 'Front Doorbell', type: 'camera', wireless: true, baseDownMbps: 0.2, baseUpMbps: 1.8, burstiness: 0.15, presence: { kind: 'always' } },
  // Randomised (locally administered) MAC, no hostname, never named: the "is this my neighbour?" device.
  { macAddress: 'DA:A1:19:5E:0C:83', hostOctet: 117, hostname: null, suggestedName: null, type: 'unknown', wireless: true, baseDownMbps: 1.2, baseUpMbps: 0.2, burstiness: 0.2, presence: { kind: 'periodic', periodMinutes: 45, onMinutes: 12 } },
]

export function ipFor(subnet: string, hostOctet: number): string {
  const base = subnet.split('/')[0] ?? '192.168.1.0'
  const octets = base.split('.')
  return `${octets[0]}.${octets[1]}.${octets[2]}.${hostOctet}`
}

export function isPresent(device: SimulatedDevice, at: Date): boolean {
  const p = device.presence
  if (p.kind === 'always') return true
  if (p.kind === 'window') {
    const h = at.getUTCHours()
    return p.fromHourUtc <= p.toHourUtc ? h >= p.fromHourUtc && h <= p.toHourUtc : h >= p.fromHourUtc || h <= p.toHourUtc
  }
  const minutes = Math.floor(at.getTime() / 60_000)
  return minutes % p.periodMinutes < p.onMinutes
}

/** Household rhythm: quiet overnight, busy in the evening. Hours in UTC. */
function diurnal(at: Date): number {
  const h = at.getUTCHours() + at.getUTCMinutes() / 60
  const evening = Math.exp(-((h - 20) ** 2) / 8)
  const morning = 0.45 * Math.exp(-((h - 8) ** 2) / 4)
  const night = h < 6 ? 0.15 : 0.3
  return night + evening + morning
}

/** Instantaneous throughput in Mbps for one device at one moment. `rand` returns [0, 1). */
export function sampleRate(device: SimulatedDevice, at: Date, rand: () => number): { downMbps: number; upMbps: number } {
  const factor = diurnal(at)
  const noise = () => 0.6 + rand() * 0.8
  const burst = rand() < device.burstiness * 0.25 ? 3 + rand() * 6 : 1
  return {
    downMbps: Math.max(0, device.baseDownMbps * factor * noise() * burst),
    upMbps: Math.max(0, device.baseUpMbps * factor * noise() * (burst > 1 ? 1 + (burst - 1) * 0.3 : 1)),
  }
}

export function signalFor(device: SimulatedDevice, rand: () => number): number | undefined {
  if (!device.wireless) return undefined
  const base = -45 - (device.hostOctet % 30)
  return Math.round(base + (rand() * 6 - 3))
}

/** Deterministic PRNG for the seed script and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
