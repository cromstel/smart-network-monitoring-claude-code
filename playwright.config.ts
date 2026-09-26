import { defineConfig, devices } from '@playwright/test'

/**
 * Five journeys that must never break (TESTING.md). Serial: 01 creates the admin the others use.
 * The server runs against a fresh SQLite database seeded with the simulated network, so runs
 * are deterministic. Requires `npm run build` first.
 */
const PORT = Number(process.env.E2E_PORT ?? 3300)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx scripts/e2e-server.ts',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      E2E_PORT: String(PORT),
      DB_CLIENT: 'sqlite',
      DB_FILE: './data/e2e.db',
      SCANNER_MODE: 'simulated',
      SCAN_INTERVAL_SECONDS: '30',
      COOKIE_SECURE: 'false',
      LOG_LEVEL: 'warn',
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-e2e-session-secret-00',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'e2e0'.repeat(16),
    },
  },
})
