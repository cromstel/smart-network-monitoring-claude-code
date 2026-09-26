import type { DiscoveredDevice, Scanner } from './types'
import { SIMULATED_ROSTER, ipFor, isPresent, sampleRate, signalFor, type SimulatedDevice } from './simulatedRoster'

interface CounterState {
  up: bigint
  down: bigint
  at: number
}

/**
 * Synthetic network for development and demos (SCANNER_MODE=simulated).
 * Produces cumulative byte counters the same way a router would, so the bandwidth pipeline
 * downstream is exercised exactly as in production.
 */
export class SimulatedScanner implements Scanner {
  readonly name = 'simulated' as const
  private readonly counters = new Map<string, CounterState>()

  constructor(
    private readonly roster: SimulatedDevice[] = SIMULATED_ROSTER,
    private readonly rand: () => number = Math.random,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  unavailableReason(): string | null {
    return null
  }

  async scan(subnet: string): Promise<DiscoveredDevice[]> {
    const now = this.clock()
    const out: DiscoveredDevice[] = []
    for (const device of this.roster) {
      if (!isPresent(device, now)) {
        this.counters.delete(device.macAddress) // a reconnecting device restarts its counters
        continue
      }
      const state = this.counters.get(device.macAddress) ?? { up: BigInt(0), down: BigInt(0), at: now.getTime() }
      const elapsedSeconds = Math.max(0, (now.getTime() - state.at) / 1000)
      const { downMbps, upMbps } = sampleRate(device, now, this.rand)
      state.down += BigInt(Math.round((downMbps * 1e6 * elapsedSeconds) / 8))
      state.up += BigInt(Math.round((upMbps * 1e6 * elapsedSeconds) / 8))
      state.at = now.getTime()
      this.counters.set(device.macAddress, state)

      const signal = signalFor(device, this.rand)
      out.push({
        macAddress: device.macAddress,
        ipAddress: ipFor(subnet, device.hostOctet),
        ...(device.hostname ? { hostname: device.hostname } : {}),
        ...(signal !== undefined ? { signalStrength: signal } : {}),
        uploadBytes: state.up.toString(),
        downloadBytes: state.down.toString(),
      })
    }
    return out
  }
}
