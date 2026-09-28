/**
 * npm run bench [-- mysql]
 * Loads 100 devices × (30 days hourly + 24 hours of 30-second raw samples) into a SCRATCH
 * database and times the queries behind the PRD §5 targets. Results go in docs/PERFORMANCE.md.
 * SQLite runs in memory; MySQL uses DB_TEST_NAME (from .env) — never real data.
 */
import { randomUUID } from 'node:crypto'
import { createDb, setDb } from '../lib/db/client'
import { migrateToLatest } from '../lib/db/migrator'
import { toDbTime } from '../lib/db/time'
import { getDeviceSeries, getNetworkSeries, getTopConsumers, rollupHourly } from '../lib/services/bandwidthService'
import { listDevices } from '../lib/services/deviceService'
import { pruneRetention } from '../lib/services/maintenanceService'
import { loadEnv } from './env'

const DEVICES = 100
const TABLES = ['notifications', 'device_alerts', 'sessions', 'user_settings', 'users', 'bandwidth_hourly', 'bandwidth_metrics', 'connection_logs', 'network_metrics', 'network_scan_history', 'router_config', 'devices', 'device_categories'] as const

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now()
  const r = await fn()
  console.log(`${label.padEnd(40)} ${(performance.now() - t).toFixed(0).padStart(6)} ms`)
  return r
}

async function main() {
  loadEnv()
  process.env.LOG_LEVEL = 'silent'
  const client = process.argv[2] === 'mysql' ? 'mysql' : 'sqlite'
  const db =
    client === 'mysql'
      ? createDb({ client, host: process.env.DB_HOST ?? '127.0.0.1', port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_TEST_NAME })
      : createDb({ client, file: ':memory:' })
  setDb(db, client)
  await migrateToLatest(db)
  for (const t of TABLES) await db.deleteFrom(t).execute()
  console.log(`bench on ${client}: ${DEVICES} devices`)

  const now = new Date()
  const ids: string[] = []
  for (let i = 0; i < DEVICES; i++) {
    const id = randomUUID()
    ids.push(id)
    const n = toDbTime(now)
    const mac = `AA:00:00:00:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 255).toString(16).padStart(2, '0')}`.toUpperCase()
    await db.insertInto('devices').values({ id, mac_address: mac, ip_address: `10.0.${i >> 8}.${i & 255}`, status: 'online', first_seen: n, last_seen: n, created_at: n, updated_at: n }).execute()
  }
  await time('load 30d hourly (72k rows)', async () => {
    let rows = []
    for (const id of ids)
      for (let h = 0; h < 720; h++) {
        const at = toDbTime(new Date(now.getTime() - (h + 25) * 3600_000))
        rows.push({ id: randomUUID(), device_id: id, hour_start: at, avg_upload_speed: 1, avg_download_speed: 5, peak_upload_speed: 2, peak_download_speed: 9, bytes_uploaded: 1000, bytes_downloaded: 5000, sample_count: 120, created_at: at })
        if (rows.length >= 1000) {
          await db.insertInto('bandwidth_hourly').values(rows).execute()
          rows = []
        }
      }
    if (rows.length) await db.insertInto('bandwidth_hourly').values(rows).execute()
  })
  await time('load 24h raw @30s (288k rows)', async () => {
    let rows = []
    for (const id of ids)
      for (let s = 0; s < 2880; s++) {
        const at = toDbTime(new Date(now.getTime() - s * 30_000))
        rows.push({ id: randomUUID(), device_id: id, timestamp: at, upload_speed: 1, download_speed: 5, upload_total: 10_000_000 - s, download_total: 50_000_000 - s, created_at: at })
        if (rows.length >= 1000) {
          await db.insertInto('bandwidth_metrics').values(rows).execute()
          rows = []
        }
      }
    if (rows.length) await db.insertInto('bandwidth_metrics').values(rows).execute()
  })
  const id = ids[42] as string
  await time('hourly rollup of 24h raw (first run)', () => rollupHourly(now))
  await time('hourly rollup re-run (idempotent)', () => rollupHourly(now))
  await time('device 30d history (hourly)', () => getDeviceSeries(id, '30d', 'hourly'))
  await time('device 24h history (raw, downsampled)', () => getDeviceSeries(id, '24h', 'raw'))
  await time('network 30d history (hourly)', () => getNetworkSeries('30d', 'hourly'))
  await time('top consumers 24h', () => getTopConsumers('24h', 5))
  await time('top consumers 30d', () => getTopConsumers('30d', 5))
  await time('device list, 100 devices, page of 50', () => listDevices({ sort: 'lastSeen', page: 1, pageSize: 50 }))
  await time('device list sorted by live bandwidth', () => listDevices({ sort: 'bandwidth', page: 1, pageSize: 50 }))
  await time('retention prune (nothing expired)', () => pruneRetention(now))
  for (const t of TABLES) await db.deleteFrom(t).execute()
  await db.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
