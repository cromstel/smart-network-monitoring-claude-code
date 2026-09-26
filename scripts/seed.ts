/**
 * npm run db:seed [-- --reset]
 *
 * A realistic 12-device home network with 7 days of history: hourly aggregates for days 2–7,
 * raw 1-minute samples for the last 24 hours, connection events, and categories. Uses the same
 * roster as the simulated scanner, so live scans continue the seeded history seamlessly.
 *
 * Users are not created here — the first-run wizard does that. Set SEED_ADMIN_EMAIL and
 * SEED_ADMIN_PASSWORD to create one non-interactively (CI, E2E, demos). If an admin exists,
 * three alert rules and a few notifications are seeded for them.
 */
import { randomUUID } from 'node:crypto'
import { closeDb, getDb, getDbClient } from '../lib/db/client'
import { migrateToLatest } from '../lib/db/migrator'
import { toDbTime } from '../lib/db/time'
import { hashPassword } from '../lib/security/password'
import { SIMULATED_ROSTER, ipFor, isPresent, mulberry32, sampleRate, signalFor } from '../lib/services/scanners/simulatedRoster'
import { lookupVendor } from '../lib/services/vendorService'
import { loadEnv } from './env'

const DAYS = 7
const RAW_STEP_MS = 60_000
const HOURLY_SUBSAMPLES = 12

const CATEGORIES = [
  { name: 'Personal', color: '#22d3ee', icon: 'smartphone', description: 'Phones, tablets, laptops' },
  { name: 'Entertainment', color: '#a78bfa', icon: 'tv', description: 'TVs, consoles, streaming' },
  { name: 'Smart Home', color: '#34d399', icon: 'home', description: 'Plugs, thermostats, speakers, cameras' },
  { name: 'Work', color: '#fbbf24', icon: 'briefcase', description: 'Work devices' },
  { name: 'Infrastructure', color: '#f87171', icon: 'server', description: 'Servers, printers, network gear' },
]

const CATEGORY_FOR: Record<string, string> = {
  phone: 'Personal',
  tablet: 'Personal',
  laptop: 'Work',
  tv: 'Entertainment',
  console: 'Entertainment',
  speaker: 'Smart Home',
  iot: 'Smart Home',
  camera: 'Smart Home',
  server: 'Infrastructure',
  printer: 'Infrastructure',
}

const TABLES_IN_DELETE_ORDER = [
  'notifications',
  'device_alerts',
  'bandwidth_hourly',
  'bandwidth_metrics',
  'connection_logs',
  'network_metrics',
  'network_scan_history',
  'devices',
  'device_categories',
] as const

async function main() {
  loadEnv()
  const db = getDb()
  await migrateToLatest(db)
  const reset = process.argv.includes('--reset')
  const existing = await db.selectFrom('devices').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()
  if (Number(existing?.n ?? 0) > 0 && !reset) {
    console.log('Database already has devices. Re-run with --reset to wipe network data and reseed (users are kept).')
    return
  }
  if (reset) for (const t of TABLES_IN_DELETE_ORDER) await db.deleteFrom(t).execute()

  const subnet = process.env.NETWORK_SUBNET ?? '192.168.1.0/24'
  const now = new Date()
  now.setUTCSeconds(0, 0)
  const start = new Date(now.getTime() - DAYS * 86400_000)
  const rawStart = new Date(now.getTime() - 86400_000)
  const hourlyEnd = new Date(rawStart)
  hourlyEnd.setUTCMinutes(0, 0, 0)
  const rand = mulberry32(20260924)
  const created = toDbTime(now)

  // Categories
  const categoryIds = new Map<string, string>()
  for (const c of CATEGORIES) {
    const id = randomUUID()
    categoryIds.set(c.name, id)
    await db.insertInto('device_categories').values({ id, ...c, created_at: created, updated_at: created }).execute()
  }

  let rawRows = 0
  let hourlyRows = 0
  const networkByMinute = new Map<number, { up: number; down: number; online: number }>()

  for (const sim of SIMULATED_ROSTER) {
    const id = randomUUID()
    const presentNow = isPresent(sim, now)

    // Connection sessions over 7 days, at 5-minute resolution.
    const sessions: { from: Date; to: Date | null }[] = []
    let open: Date | null = null
    for (let t = start.getTime(); t <= now.getTime(); t += 5 * 60_000) {
      const p = isPresent(sim, new Date(t))
      if (p && !open) open = new Date(t)
      if (!p && open) {
        sessions.push({ from: open, to: new Date(t) })
        open = null
      }
    }
    if (open) sessions.push({ from: open, to: null })
    const firstSeen = sessions[0]?.from ?? start
    const lastSeen = presentNow ? now : (sessions[sessions.length - 1]?.to ?? start)
    const closedSeconds = sessions.filter((s) => s.to).reduce((sum, s) => sum + ((s.to as Date).getTime() - s.from.getTime()) / 1000, 0)

    await db
      .insertInto('devices')
      .values({
        id,
        mac_address: sim.macAddress,
        ip_address: ipFor(subnet, sim.hostOctet),
        hostname: sim.hostname,
        device_name: sim.suggestedName,
        device_type: sim.type,
        manufacturer: lookupVendor(sim.macAddress),
        signal_strength: signalFor(sim, rand) ?? null,
        status: presentNow ? 'online' : 'offline',
        is_blocked: 0,
        is_ignored: 0,
        total_connection_time: Math.round(closedSeconds),
        category_id: sim.suggestedName ? (categoryIds.get(CATEGORY_FOR[sim.type] ?? '') ?? null) : null,
        first_seen: toDbTime(firstSeen),
        last_seen: toDbTime(lastSeen),
        created_at: toDbTime(firstSeen),
        updated_at: created,
      })
      .execute()

    const logs = sessions.flatMap((s) => [
      { id: randomUUID(), device_id: id, event_type: 'connected', timestamp: toDbTime(s.from), ip_address: ipFor(subnet, sim.hostOctet), connection_duration: null, created_at: created },
      ...(s.to
        ? [{ id: randomUUID(), device_id: id, event_type: 'disconnected', timestamp: toDbTime(s.to), ip_address: ipFor(subnet, sim.hostOctet), connection_duration: Math.round((s.to.getTime() - s.from.getTime()) / 1000), created_at: created }]
        : []),
    ])
    for (let i = 0; i < logs.length; i += 500) await db.insertInto('connection_logs').values(logs.slice(i, i + 500)).execute()

    // Hourly aggregates for days 2–7.
    let totalUp = BigInt(0)
    let totalDown = BigInt(0)
    const hourly = []
    for (let h = new Date(start).setUTCMinutes(0, 0, 0); h < hourlyEnd.getTime(); h += 3600_000) {
      let n = 0
      let sumUp = 0
      let sumDown = 0
      let peakUp = 0
      let peakDown = 0
      for (let k = 0; k < HOURLY_SUBSAMPLES; k++) {
        const at = new Date(h + (k * 3600_000) / HOURLY_SUBSAMPLES)
        if (!isPresent(sim, at)) continue
        const r = sampleRate(sim, at, rand)
        n++
        sumUp += r.upMbps
        sumDown += r.downMbps
        peakUp = Math.max(peakUp, r.upMbps)
        peakDown = Math.max(peakDown, r.downMbps)
      }
      if (n === 0) continue
      const fraction = n / HOURLY_SUBSAMPLES
      const bytesUp = BigInt(Math.round(((sumUp / n) * 1e6 * 3600 * fraction) / 8))
      const bytesDown = BigInt(Math.round(((sumDown / n) * 1e6 * 3600 * fraction) / 8))
      totalUp += bytesUp
      totalDown += bytesDown
      hourly.push({
        id: randomUUID(),
        device_id: id,
        hour_start: toDbTime(new Date(h)),
        avg_upload_speed: round3(sumUp / n),
        avg_download_speed: round3(sumDown / n),
        peak_upload_speed: round3(peakUp),
        peak_download_speed: round3(peakDown),
        bytes_uploaded: bytesUp.toString(),
        bytes_downloaded: bytesDown.toString(),
        sample_count: Math.round(fraction * 60),
        created_at: created,
      })
    }
    for (let i = 0; i < hourly.length; i += 500) await db.insertInto('bandwidth_hourly').values(hourly.slice(i, i + 500)).execute()
    hourlyRows += hourly.length

    // Raw 1-minute samples for the last 24 hours, continuing the cumulative totals.
    const raw = []
    for (let t = rawStart.getTime(); t <= now.getTime(); t += RAW_STEP_MS) {
      const at = new Date(t)
      if (!isPresent(sim, at)) continue
      const r = sampleRate(sim, at, rand)
      totalUp += BigInt(Math.round((r.upMbps * 1e6 * 60) / 8))
      totalDown += BigInt(Math.round((r.downMbps * 1e6 * 60) / 8))
      raw.push({
        id: randomUUID(),
        device_id: id,
        timestamp: toDbTime(at),
        upload_speed: round3(r.upMbps),
        download_speed: round3(r.downMbps),
        upload_total: totalUp.toString(),
        download_total: totalDown.toString(),
        created_at: created,
      })
      const bucket = networkByMinute.get(t) ?? { up: 0, down: 0, online: 0 }
      bucket.up += r.upMbps
      bucket.down += r.downMbps
      bucket.online += 1
      networkByMinute.set(t, bucket)
    }
    for (let i = 0; i < raw.length; i += 500) await db.insertInto('bandwidth_metrics').values(raw.slice(i, i + 500)).execute()
    rawRows += raw.length
  }

  const network = [...networkByMinute.entries()].map(([t, b]) => ({
    id: randomUUID(),
    timestamp: toDbTime(new Date(t)),
    total_bandwidth_up: round3(b.up),
    total_bandwidth_down: round3(b.down),
    active_devices: b.online,
    online_devices: b.online,
    peak_bandwidth_up: round3(b.up),
    peak_bandwidth_down: round3(b.down),
    created_at: created,
  }))
  for (let i = 0; i < network.length; i += 500) await db.insertInto('network_metrics').values(network.slice(i, i + 500)).execute()

  // Optional non-interactive admin.
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (email && password) {
    const exists = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst()
    if (!exists) {
      const userId = randomUUID()
      await db
        .insertInto('users')
        .values({ id: userId, email, password_hash: await hashPassword(password), name: 'Admin', role: 'ADMIN', is_active: 1, created_at: created, updated_at: created })
        .execute()
      await db
        .insertInto('user_settings')
        .values({ id: randomUUID(), user_id: userId, network_subnet: subnet, ignore_subnets: '[]', created_at: created, updated_at: created })
        .execute()
      console.log(`Created admin ${email}`)
    }
  }

  const admin = await db.selectFrom('users').select('id').where('role', '=', 'ADMIN').orderBy('created_at', 'asc').executeTakeFirst()
  if (admin) {
    const devices = await db.selectFrom('devices').select(['id', 'mac_address', 'device_name']).execute()
    const tv = devices.find((d) => d.device_name === 'Living Room TV')
    const laptop = devices.find((d) => d.device_name === 'Work Laptop')
    const guest = devices.find((d) => d.mac_address === 'DA:A1:19:5E:0C:83')
    const rules = [
      { alert_type: 'unknown_device', device_id: null, threshold: null },
      { alert_type: 'bandwidth_exceeded', device_id: tv?.id ?? null, threshold: 40 },
      { alert_type: 'device_offline', device_id: laptop?.id ?? null, threshold: null },
    ]
    for (const r of rules) {
      await db.insertInto('device_alerts').values({ id: randomUUID(), user_id: admin.id, ...r, is_active: 1, trigger_count: 0, created_at: created, updated_at: created }).execute()
    }
    if (guest) {
      await db
        .insertInto('notifications')
        .values({
          id: randomUUID(),
          user_id: admin.id,
          device_id: guest.id,
          alert_id: null,
          title: 'Unknown device connected',
          message: `Private (randomised MAC) device ${guest.mac_address} joined the network.`,
          type: 'warning',
          priority: 'high',
          is_read: 0,
          data: JSON.stringify({ kind: 'unknown_device', deviceId: guest.id }),
          created_at: toDbTime(new Date(now.getTime() - 3 * 86400_000)),
        })
        .execute()
    }
    console.log('Seeded 3 alert rules for the first admin.')
  } else {
    console.log('No admin yet — alert rules will be created by you after first-run setup.')
  }

  console.log(
    `Seeded (${getDbClient()}): ${SIMULATED_ROSTER.length} devices, ${CATEGORIES.length} categories, ${hourlyRows} hourly rows, ${rawRows} raw samples, ${network.length} network samples.`,
  )
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err)
    await closeDb()
    process.exit(1)
  })
