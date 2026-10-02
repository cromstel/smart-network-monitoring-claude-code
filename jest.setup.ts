import '@testing-library/jest-dom'
import { loadEnv } from './scripts/env'

// Connection details (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_TEST_NAME) come from .env so
// `npm run test:mysql` works. The dialect is chosen by the npm script via DB_CLIENT, because
// next/jest loads .env itself too and would otherwise re-apply DB_CLIENT from that file.
loadEnv()

process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0000'
process.env.ENCRYPTION_KEY ??= '0'.repeat(63) + '1'
process.env.LOG_LEVEL = 'silent'
process.env.SCHEDULER_ENABLED = 'false'
