// @ts-check
const nextJest = require('next/jest')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  // Integration suites share process-level singletons (db, event bus); run files serially.
  maxWorkers: 1,
  collectCoverageFrom: [
    'lib/services/**/*.ts',
    'lib/db/repositories/**/*.ts',
    'lib/utils/**/*.ts',
    'lib/security/**/*.ts',
    '!lib/services/scanners/arpScanner.ts',
    '!lib/services/scanners/asusScanner.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 70, statements: 70, functions: 70, branches: 60 },
    './lib/utils/': { lines: 90, statements: 90 },
  },
}

module.exports = createJestConfig(config)
