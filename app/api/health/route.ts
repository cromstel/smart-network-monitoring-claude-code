import { NextResponse } from 'next/server'
import { sql } from 'kysely'
import { getDb, getDbClient } from '@/lib/db/client'
import { activeScannerName } from '@/lib/services/scanners/registry'
import { scanStatus } from '@/lib/services/scanService'
import { getNetworkSettings } from '@/lib/services/settingsService'
import type { HealthDTO } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const VERSION = process.env.npm_package_version ?? '1.0.0'

/** Public. For container healthchecks and uptime monitoring. */
export async function GET(): Promise<Response> {
  let connected = false
  try {
    await sql`select 1`.execute(getDb())
    connected = true
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'health: database unreachable')
  }
  const status = scanStatus()
  let healthy = false
  if (connected && status.lastResult) {
    const { scanIntervalSeconds } = await getNetworkSettings().catch(() => ({ scanIntervalSeconds: 30 }))
    healthy = Date.now() - status.lastResult.at.getTime() < Math.max(scanIntervalSeconds * 3, 120) * 1000
  }
  const body: HealthDTO = {
    status: connected ? 'ok' : 'degraded',
    version: VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    database: { client: getDbClient(), connected },
    scanner: { mode: activeScannerName(), lastScanAt: status.lastResult?.at.toISOString() ?? null, healthy },
  }
  return NextResponse.json(body, { status: connected ? 200 : 503 })
}
