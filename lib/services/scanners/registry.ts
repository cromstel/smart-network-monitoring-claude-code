/**
 * Scanner selection (PRD F-02, F-07, ARCHITECTURE §5):
 *   SCANNER_MODE's scanner → asus (router configured and reachable) → arp (capability probe) → simulated.
 * Each fallback logs what failed and what it chose. The result is cached until invalidated
 * (router config change, or a scan failure).
 */
import { getConfig } from '@/lib/config'
import { logger } from '@/lib/utils/logger'
import { loadCredentials } from '../routerService'
import { ArpScanner } from './arpScanner'
import { AsusScanner } from './asusScanner'
import { SimulatedScanner } from './simulatedScanner'
import type { Scanner, ScannerName } from './types'

interface RegistryState {
  active: Scanner | null
  instances: Partial<Record<ScannerName, Scanner>>
}

const g = globalThis as unknown as { __snmScanners?: RegistryState }
const state: RegistryState = g.__snmScanners ?? { active: null, instances: {} }
g.__snmScanners = state

function instance(name: ScannerName): Scanner {
  const existing = state.instances[name]
  if (existing) return existing
  const created = name === 'simulated' ? new SimulatedScanner() : name === 'arp' ? new ArpScanner() : new AsusScanner(loadCredentials)
  state.instances[name] = created
  return created
}

export function fallbackOrder(preferred: ScannerName): ScannerName[] {
  return [...new Set<ScannerName>([preferred, 'asus', 'arp', 'simulated'])]
}

export async function getScanner(): Promise<Scanner> {
  if (state.active) return state.active
  const preferred = getConfig().SCANNER_MODE
  const tried: { scanner: ScannerName; reason: string }[] = []
  for (const name of fallbackOrder(preferred)) {
    const scanner = instance(name)
    if (await scanner.isAvailable()) {
      if (tried.length > 0) {
        logger.warn({ preferred, failed: tried, fallback: name }, 'preferred scanner unavailable; falling back')
      } else {
        logger.info({ scanner: name }, 'scanner selected')
      }
      state.active = scanner
      return scanner
    }
    tried.push({ scanner: name, reason: scanner.unavailableReason?.() ?? 'unavailable' })
  }
  // Unreachable in practice: the simulated scanner is always available.
  throw new Error('no scanner available')
}

export function activeScannerName(): ScannerName | null {
  return state.active?.name ?? null
}

/** Force re-selection on the next scan (router settings changed, or the active scanner failed). */
export function invalidateScanner(): void {
  state.active = null
  delete state.instances.asus
}

export function setScannerForTests(scanner: Scanner | null): void {
  state.active = scanner
}
