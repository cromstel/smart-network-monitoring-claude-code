/**
 * Retention (PRD F-51, AUDIT A-17). Deletes in batches — a single unbounded DELETE over
 * millions of rows locks the table and stalls the scanner (DATABASE.md "Retention").
 * Batches are "select ids LIMIT n, then delete by id": MySQL does not allow LIMIT inside an
 * IN-subquery and SQLite does not allow DELETE … LIMIT, so this is the portable form.
 */
import * as bandwidthRepo from '@/lib/db/repositories/bandwidthRepository'
import * as connectionRepo from '@/lib/db/repositories/connectionLogRepository'
import * as notificationRepo from '@/lib/db/repositories/notificationRepository'
import * as networkRepo from '@/lib/db/repositories/networkRepository'
import * as userRepo from '@/lib/db/repositories/userRepository'
import { logger } from '@/lib/utils/logger'
import { getNetworkSettings } from './settingsService'

export const PRUNE_BATCH_SIZE = 10_000
const PAUSE_MS = 50
export const SCAN_HISTORY_DAYS = 7

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function drain(select: (limit: number) => Promise<string[]>, remove: (ids: string[]) => Promise<number>, batch: number): Promise<number> {
  let total = 0
  for (;;) {
    const ids = await select(batch)
    if (ids.length === 0) return total
    total += await remove(ids)
    if (ids.length < batch) return total
    await sleep(PAUSE_MS)
  }
}

export interface PruneResult {
  retentionDays: number
  bandwidthMetrics: number
  bandwidthHourly: number
  connectionLogs: number
  notifications: number
  networkMetrics: number
  scanHistory: number
  sessions: number
}

export async function pruneRetention(now: Date = new Date(), batch = PRUNE_BATCH_SIZE): Promise<PruneResult> {
  const { dataRetentionDays } = await getNetworkSettings()
  const cutoff = new Date(now.getTime() - dataRetentionDays * 86400_000)
  const result: PruneResult = {
    retentionDays: dataRetentionDays,
    bandwidthMetrics: await drain((n) => bandwidthRepo.selectRawIdsBefore(cutoff, n), bandwidthRepo.deleteRawByIds, batch),
    bandwidthHourly: await drain((n) => bandwidthRepo.selectHourlyIdsBefore(cutoff, n), bandwidthRepo.deleteHourlyByIds, batch),
    connectionLogs: await drain((n) => connectionRepo.selectIdsBefore(cutoff, n), connectionRepo.deleteByIds, batch),
    notifications: await drain((n) => notificationRepo.selectIdsBefore(cutoff, n), notificationRepo.deleteByIds, batch),
    networkMetrics: await drain((n) => networkRepo.selectMetricIdsBefore(cutoff, n), networkRepo.deleteMetricsByIds, batch),
    scanHistory: await networkRepo.deleteScansBefore(new Date(now.getTime() - SCAN_HISTORY_DAYS * 86400_000)),
    sessions: await userRepo.deleteExpiredSessions(now),
  }
  logger.info({ ...result }, 'retention prune complete')
  return result
}
