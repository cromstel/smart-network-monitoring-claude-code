import { startScheduler } from './lib/jobs/scheduler'
import { logger } from './lib/utils/logger'

try {
  await startScheduler()
} catch (err) {
  // A bad environment must stop the server, not leave it half-alive (ARCHITECTURE §7).
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'startup failed')
  process.exit(1)
}
