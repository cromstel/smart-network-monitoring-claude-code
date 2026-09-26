/**
 * Background jobs, started once per process from instrumentation.ts.
 *   scan       every scanIntervalSeconds — a self-rescheduling timer, so a changed interval
 *              takes effect on the next tick without a restart (PRD F-50), and a slow scan
 *              can never overlap the next one.
 *   rollup     hourly at :05 (node-cron) — raw samples → bandwidth_hourly.
 *   prune      nightly at 03:30 (node-cron) — retention (PRD F-51).
 * All jobs are idempotent; a job failure is logged and retried on its next run, never silent.
 */
import cron, { type ScheduledTask } from 'node-cron'
import { getConfig } from '@/lib/config'
import { migrateToLatest } from '@/lib/db/migrator'
import { logger } from '@/lib/utils/logger'
import { sweep } from '@/lib/utils/rateLimit'
import { AppError } from '@/lib/api/errors'
import { rollupHourly } from '@/lib/services/bandwidthService'
import { subscribe } from '@/lib/services/eventBus'
import { pruneRetention } from '@/lib/services/maintenanceService'
import { runScan } from '@/lib/services/scanService'
import { invalidateScanner } from '@/lib/services/scanners/registry'
import { getNetworkSettings } from '@/lib/services/settingsService'

interface SchedulerState {
  started: boolean
  timer: NodeJS.Timeout | null
  tasks: ScheduledTask[]
  unsubscribe: (() => void) | null
  intervalSeconds: number
}

const g = globalThis as unknown as { __snmScheduler?: SchedulerState }
const state: SchedulerState = g.__snmScheduler ?? { started: false, timer: null, tasks: [], unsubscribe: null, intervalSeconds: 30 }
g.__snmScheduler = state

async function scanTick(): Promise<void> {
  try {
    await runScan()
  } catch (err) {
    if (err instanceof AppError && err.code === 'CONFLICT') {
      logger.debug('scheduled scan skipped: a manual scan is running')
    } else if (!(err instanceof AppError)) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'scheduled scan failed')
    }
  } finally {
    scheduleNextScan()
  }
}

function scheduleNextScan(): void {
  if (!state.started) return
  if (state.timer) clearTimeout(state.timer)
  void getNetworkSettings()
    .then((s) => s.scanIntervalSeconds)
    .catch(() => state.intervalSeconds)
    .then((seconds) => {
      state.intervalSeconds = seconds
      if (!state.started) return
      state.timer = setTimeout(() => void scanTick(), seconds * 1000)
      state.timer.unref?.()
    })
}

async function guarded(name: string, job: () => Promise<unknown>): Promise<void> {
  try {
    const result = await job()
    logger.info({ job: name, result }, 'job complete')
  } catch (err) {
    logger.error({ job: name, err: err instanceof Error ? err.message : String(err) }, 'job failed; will retry on next run')
  }
}

export async function startScheduler(): Promise<void> {
  if (state.started) return
  const config = getConfig() // fail fast on a bad environment
  if (config.AUTO_MIGRATE) {
    const applied = await migrateToLatest()
    if (applied.length > 0) logger.info({ applied }, 'database migrated')
  }
  if (!config.SCHEDULER_ENABLED) {
    logger.info('scheduler disabled (SCHEDULER_ENABLED=false)')
    return
  }
  state.started = true

  state.tasks.push(cron.schedule('5 * * * *', () => void guarded('rollup', () => rollupHourly())))
  state.tasks.push(cron.schedule('30 3 * * *', () => void guarded('prune', () => pruneRetention())))
  state.tasks.push(cron.schedule('*/10 * * * *', () => sweep()))

  state.unsubscribe = subscribe((event) => {
    if (event.name === 'settings.changed' && 'scanIntervalSeconds' in event.data) {
      logger.info({ scanIntervalSeconds: event.data.scanIntervalSeconds }, 'scan interval changed; rescheduling')
      scheduleNextScan()
    }
    if (event.name === 'router.changed' || (event.name === 'settings.changed' && 'networkSubnet' in event.data)) {
      invalidateScanner()
    }
  })

  // Catch up on rollups missed while the server was down, then start scanning immediately.
  void guarded('rollup', () => rollupHourly())
  logger.info({ scannerMode: config.SCANNER_MODE }, 'scheduler started')
  void scanTick()
}

export function stopScheduler(): void {
  state.started = false
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
  for (const t of state.tasks) t.stop()
  state.tasks = []
  state.unsubscribe?.()
  state.unsubscribe = null
}
