/**
 * Offline MAC vendor lookup (PRD F-04) from the bundled IEEE OUI registry (`oui-data`).
 * No network call per device — nothing leaves the local network.
 */
import { isRandomizedMac, normalizeMac } from '@/lib/utils/network'
import { logger } from '@/lib/utils/logger'

type OuiTable = Record<string, string>

const g = globalThis as unknown as { __snmOui?: OuiTable | null }

function table(): OuiTable | null {
  if (g.__snmOui !== undefined) return g.__snmOui
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 6 MB JSON, loaded once on first use
    g.__snmOui = require('oui-data') as OuiTable
  } catch (err) {
    logger.warn({ err }, 'oui-data could not be loaded; vendor lookup disabled')
    g.__snmOui = null
  }
  return g.__snmOui
}

/** First line of the registry entry is the organisation name. */
export function lookupVendor(mac: string): string | null {
  const normalized = normalizeMac(mac)
  if (!normalized) return null
  const prefix = normalized.replace(/:/g, '').slice(0, 6)
  const entry = table()?.[prefix]
  if (entry) return entry.split('\n')[0]?.trim() || null
  if (isRandomizedMac(normalized)) return 'Private (randomised MAC)'
  return null
}
