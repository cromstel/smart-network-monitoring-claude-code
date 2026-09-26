import { randomUUID } from 'node:crypto'
import { getDb, getDbClient } from '../client'
import { fromDbTime, nowDb, toBigString, toDbTime } from '../time'
import type { BandwidthHourly, BandwidthMetric } from '@/lib/types'
import { rowToHourly, rowToMetric } from './mappers'

export interface NewMetric {
  deviceId: string
  timestamp: Date
  uploadSpeed: number
  downloadSpeed: number
  uploadTotal: string
  downloadTotal: string
}

export async function insertMetrics(metrics: NewMetric[]): Promise<void> {
  if (metrics.length === 0) return
  const created = nowDb()
  const db = getDb()
  for (let i = 0; i < metrics.length; i += 500) {
    await db
      .insertInto('bandwidth_metrics')
      .values(
        metrics.slice(i, i + 500).map((m) => ({
          id: randomUUID(),
          device_id: m.deviceId,
          timestamp: toDbTime(m.timestamp),
          upload_speed: m.uploadSpeed,
          download_speed: m.downloadSpeed,
          upload_total: m.uploadTotal,
          download_total: m.downloadTotal,
          created_at: created,
        })),
      )
      .execute()
  }
}

/** Most recent sample per device (optionally only samples newer than `since`). */
export async function latestForDevices(deviceIds: string[], since?: Date): Promise<Map<string, BandwidthMetric>> {
  const out = new Map<string, BandwidthMetric>()
  if (deviceIds.length === 0) return out
  const db = getDb()
  let latest = db
    .selectFrom('bandwidth_metrics')
    .select(['device_id', (eb) => eb.fn.max('timestamp').as('ts')])
    .where('device_id', 'in', deviceIds)
    .groupBy('device_id')
  if (since) latest = latest.where('timestamp', '>=', toDbTime(since))
  const maxes = await latest.execute()
  if (maxes.length === 0) return out
  const rows = await db
    .selectFrom('bandwidth_metrics')
    .selectAll()
    .where((eb) =>
      eb.or(maxes.map((m) => eb.and([eb('device_id', '=', m.device_id), eb('timestamp', '=', String(m.ts))]))),
    )
    .execute()
  for (const r of rows) out.set(r.device_id, rowToMetric(r))
  return out
}

export async function rawSeries(deviceId: string, from: Date, to: Date): Promise<BandwidthMetric[]> {
  const rows = await getDb()
    .selectFrom('bandwidth_metrics')
    .selectAll()
    .where('device_id', '=', deviceId)
    .where('timestamp', '>=', toDbTime(from))
    .where('timestamp', '<=', toDbTime(to))
    .orderBy('timestamp', 'asc')
    .execute()
  return rows.map(rowToMetric)
}

/** Raw rows in [from, to) for all devices, plus the last row before `from` per device (for deltas). */
export async function rawWindowWithBaseline(from: Date, to: Date): Promise<{ rows: BandwidthMetric[]; baseline: Map<string, BandwidthMetric> }> {
  const db = getDb()
  const rows = (
    await db
      .selectFrom('bandwidth_metrics')
      .selectAll()
      .where('timestamp', '>=', toDbTime(from))
      .where('timestamp', '<', toDbTime(to))
      .orderBy('device_id')
      .orderBy('timestamp', 'asc')
      .execute()
  ).map(rowToMetric)
  const deviceIds = [...new Set(rows.map((r) => r.deviceId))]
  const baseline = new Map<string, BandwidthMetric>()
  if (deviceIds.length > 0) {
    const prior = await db
      .selectFrom('bandwidth_metrics')
      .select(['device_id', (eb) => eb.fn.max('timestamp').as('ts')])
      .where('device_id', 'in', deviceIds)
      .where('timestamp', '<', toDbTime(from))
      .where('timestamp', '>=', toDbTime(new Date(from.getTime() - 2 * 3600_000)))
      .groupBy('device_id')
      .execute()
    if (prior.length > 0) {
      const priorRows = await db
        .selectFrom('bandwidth_metrics')
        .selectAll()
        .where((eb) => eb.or(prior.map((p) => eb.and([eb('device_id', '=', p.device_id), eb('timestamp', '=', String(p.ts))]))))
        .execute()
      for (const r of priorRows) baseline.set(r.device_id, rowToMetric(r))
    }
  }
  return { rows, baseline }
}

export async function hourlySeries(deviceId: string, from: Date, to: Date): Promise<BandwidthHourly[]> {
  const rows = await getDb()
    .selectFrom('bandwidth_hourly')
    .selectAll()
    .where('device_id', '=', deviceId)
    .where('hour_start', '>=', toDbTime(from))
    .where('hour_start', '<=', toDbTime(to))
    .orderBy('hour_start', 'asc')
    .execute()
  return rows.map(rowToHourly)
}

/** Network-wide hourly series: per-device aggregates summed per hour. */
export async function networkHourlySeries(from: Date, to: Date): Promise<BandwidthHourly[]> {
  const rows = await getDb()
    .selectFrom('bandwidth_hourly')
    .select([
      'hour_start',
      (eb) => eb.fn.sum<number>('avg_upload_speed').as('up'),
      (eb) => eb.fn.sum<number>('avg_download_speed').as('down'),
      (eb) => eb.fn.sum<number>('peak_upload_speed').as('peak_up'),
      (eb) => eb.fn.sum<number>('peak_download_speed').as('peak_down'),
      (eb) => eb.fn.sum<string>('bytes_uploaded').as('bytes_up'),
      (eb) => eb.fn.sum<string>('bytes_downloaded').as('bytes_down'),
      (eb) => eb.fn.sum<number>('sample_count').as('samples'),
    ])
    .where('hour_start', '>=', toDbTime(from))
    .where('hour_start', '<=', toDbTime(to))
    .groupBy('hour_start')
    .orderBy('hour_start', 'asc')
    .execute()
  return rows.map((r) => ({
    id: String(r.hour_start),
    deviceId: '*',
    hourStart: fromDbTime(String(r.hour_start)),
    avgUploadSpeed: Number(r.up),
    avgDownloadSpeed: Number(r.down),
    peakUploadSpeed: Number(r.peak_up),
    peakDownloadSpeed: Number(r.peak_down),
    bytesUploaded: toBigString(r.bytes_up),
    bytesDownloaded: toBigString(r.bytes_down),
    sampleCount: Number(r.samples),
  }))
}

export interface HourlyUpsert {
  deviceId: string
  hourStart: Date
  avgUploadSpeed: number
  avgDownloadSpeed: number
  peakUploadSpeed: number
  peakDownloadSpeed: number
  bytesUploaded: string
  bytesDownloaded: string
  sampleCount: number
}

/** Idempotent: the (device_id, hour_start) unique key turns a re-run into an overwrite. */
export async function upsertHourly(rows: HourlyUpsert[]): Promise<void> {
  if (rows.length === 0) return
  const db = getDb()
  const mysql = getDbClient() === 'mysql'
  const now = nowDb()
  for (const r of rows) {
    const values = {
      avg_upload_speed: r.avgUploadSpeed,
      avg_download_speed: r.avgDownloadSpeed,
      peak_upload_speed: r.peakUploadSpeed,
      peak_download_speed: r.peakDownloadSpeed,
      bytes_uploaded: r.bytesUploaded,
      bytes_downloaded: r.bytesDownloaded,
      sample_count: r.sampleCount,
    }
    const insert = db.insertInto('bandwidth_hourly').values({
      id: randomUUID(),
      device_id: r.deviceId,
      hour_start: toDbTime(r.hourStart),
      created_at: now,
      ...values,
    })
    if (mysql) await insert.onDuplicateKeyUpdate(values).execute()
    else await insert.onConflict((oc) => oc.columns(['device_id', 'hour_start']).doUpdateSet(values)).execute()
  }
}

export async function latestHourlyStart(): Promise<Date | null> {
  const row = await getDb()
    .selectFrom('bandwidth_hourly')
    .select((eb) => eb.fn.max('hour_start').as('ts'))
    .executeTakeFirst()
  return row?.ts ? fromDbTime(String(row.ts)) : null
}

export async function oldestRawTimestamp(): Promise<Date | null> {
  const row = await getDb()
    .selectFrom('bandwidth_metrics')
    .select((eb) => eb.fn.min('timestamp').as('ts'))
    .executeTakeFirst()
  return row?.ts ? fromDbTime(String(row.ts)) : null
}

/** Bytes transferred per device within [from, now], from raw cumulative counters. */
export async function bytesByDeviceRaw(from: Date): Promise<Map<string, { up: string; down: string }>> {
  const rows = await getDb()
    .selectFrom('bandwidth_metrics')
    .select([
      'device_id',
      (eb) => eb.fn.max('upload_total').as('max_up'),
      (eb) => eb.fn.min('upload_total').as('min_up'),
      (eb) => eb.fn.max('download_total').as('max_down'),
      (eb) => eb.fn.min('download_total').as('min_down'),
    ])
    .where('timestamp', '>=', toDbTime(from))
    .groupBy('device_id')
    .execute()
  const out = new Map<string, { up: string; down: string }>()
  for (const r of rows) {
    const up = BigInt(toBigString(r.max_up)) - BigInt(toBigString(r.min_up))
    const down = BigInt(toBigString(r.max_down)) - BigInt(toBigString(r.min_down))
    out.set(r.device_id, { up: (up < BigInt(0) ? BigInt(0) : up).toString(), down: (down < BigInt(0) ? BigInt(0) : down).toString() })
  }
  return out
}

/** Bytes transferred per device from hourly aggregates. */
export async function bytesByDeviceHourly(from: Date): Promise<Map<string, { up: string; down: string }>> {
  const rows = await getDb()
    .selectFrom('bandwidth_hourly')
    .select([
      'device_id',
      (eb) => eb.fn.sum<string>('bytes_uploaded').as('up'),
      (eb) => eb.fn.sum<string>('bytes_downloaded').as('down'),
    ])
    .where('hour_start', '>=', toDbTime(from))
    .groupBy('device_id')
    .execute()
  return new Map(rows.map((r) => [r.device_id, { up: toBigString(r.up), down: toBigString(r.down) }]))
}

export async function peakForDevice(deviceId: string, from: Date): Promise<{ up: number; down: number }> {
  const db = getDb()
  const raw = await db
    .selectFrom('bandwidth_metrics')
    .select([(eb) => eb.fn.max('upload_speed').as('up'), (eb) => eb.fn.max('download_speed').as('down')])
    .where('device_id', '=', deviceId)
    .where('timestamp', '>=', toDbTime(from))
    .executeTakeFirst()
  const hourly = await db
    .selectFrom('bandwidth_hourly')
    .select([(eb) => eb.fn.max('peak_upload_speed').as('up'), (eb) => eb.fn.max('peak_download_speed').as('down')])
    .where('device_id', '=', deviceId)
    .where('hour_start', '>=', toDbTime(from))
    .executeTakeFirst()
  return {
    up: Math.max(Number(raw?.up ?? 0), Number(hourly?.up ?? 0)),
    down: Math.max(Number(raw?.down ?? 0), Number(hourly?.down ?? 0)),
  }
}

export async function selectRawIdsBefore(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await getDb()
    .selectFrom('bandwidth_metrics')
    .select('id')
    .where('timestamp', '<', toDbTime(cutoff))
    .limit(limit)
    .execute()
  return rows.map((r) => r.id)
}

export async function deleteRawByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await getDb().deleteFrom('bandwidth_metrics').where('id', 'in', ids).executeTakeFirst()
  return Number(res.numDeletedRows)
}

export async function selectHourlyIdsBefore(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await getDb()
    .selectFrom('bandwidth_hourly')
    .select('id')
    .where('hour_start', '<', toDbTime(cutoff))
    .limit(limit)
    .execute()
  return rows.map((r) => r.id)
}

export async function deleteHourlyByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await getDb().deleteFrom('bandwidth_hourly').where('id', 'in', ids).executeTakeFirst()
  return Number(res.numDeletedRows)
}

export async function countRaw(): Promise<number> {
  const row = await getDb().selectFrom('bandwidth_metrics').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()
  return Number(row?.n ?? 0)
}
