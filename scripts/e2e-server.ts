/** Fresh database → seed (no users) → production server. Cross-platform; used by playwright.config.ts. */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'

const file = process.env.DB_FILE ?? './data/e2e.db'
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true })

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const seed = spawnSync(npx, ['tsx', 'scripts/seed.ts'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' })
if (seed.status !== 0) process.exit(seed.status ?? 1)

const server = spawn(npx, ['next', 'start', '-p', process.env.E2E_PORT ?? '3300'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' })
const stop = () => server.kill('SIGTERM')
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
server.on('exit', (code) => process.exit(code ?? 0))
