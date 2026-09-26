import '@testing-library/jest-dom'

process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-0000'
process.env.ENCRYPTION_KEY ??= '0'.repeat(63) + '1'
process.env.LOG_LEVEL = 'silent'
process.env.SCHEDULER_ENABLED = 'false'
