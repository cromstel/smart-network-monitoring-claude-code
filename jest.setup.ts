import '@testing-library/jest-dom'
import { loadEnv } from './scripts/env'

// Tests read DB_* (test:mysql), SESSION_SECRET, ... from .env like the app does.
// DB_CLIENT is preserved so `npm test` stays SQLite-only; only `npm run test:mysql`
// (cross-env DB_CLIENT=mysql) opts into the MySQL dialect.
const cliDbClient = process.env.DB_CLIENT
loadEnv()
if (cliDbClient === undefined) delete process.env.DB_CLIENT
else process.env.DB_CLIENT = cliDbClient

process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0000'
process.env.ENCRYPTION_KEY ??= '0'.repeat(63) + '1'
process.env.LOG_LEVEL = 'silent'
process.env.SCHEDULER_ENABLED = 'false'
