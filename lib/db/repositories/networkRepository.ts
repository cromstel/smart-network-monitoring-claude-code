import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { fromDbTime, nowDb, toDbTime } from '../time'
import type { NetworkMetric, ScanHistory } from '@/lib/types'
import { rowToNetworkMetric, rowToScanHistory } from './mappers'

export async function insertMetric(m: Omit<NetworkMetric, 'id'>): Promise<void> {
  await getDb()
    .insertInto('network_metrics')
    .values({
      id: randomUUID(),
      timestamp: toDbTime(m.timestamp),
      total_bandwidth_up: m.totalBandwidthUp,
      total_bandwidth_down: m.totalBandwidthDown,
      active_devices: m.activeDevices,
      online_devices: m.onlineDevices,
      peak_bandwidth_up: m.peakBandwidthUp,
      peak_bandwidth_down: m.peakBandwidthDown,
      created_at: nowDb(),
    })
    .execute()
}

export async function latestMetric(): Promise<NetworkMetric | null> {
  const row = await getDb().selectFrom('network_metrics').selectAll().orderBy('timestamp', 'desc').limit(1).executeTakeFirst()
  return row ? rowToNetworkMetric(row) : null
}

export async function metricSeries(from: Date, to: Date): Promise<NetworkMetric[]> {
  const rows = await getDb()
    .selectFrom('network_metrics')
    .selectAll()
    .where('timestamp', '>=', toDbTime(from))
    .where('timestamp', '<=', toDbTime(to))
    .orderBy('timestamp', 'asc')
    .execute()
  return rows.map(rowToNetworkMetric)
}

export async function peakSince(from: Date): Promise<{ up: number; down: number }> {
  const row = await getDb()
    .selectFrom('network_metrics')
    .select([(eb) => eb.fn.max('total_bandwidth_up').as('up'), (eb) => eb.fn.max('total_bandwidth_down').as('down')])
    .where('timestamp', '>=', toDbTime(from))
    .executeTakeFirst()
  return { up: Number(row?.up ?? 0), down: Number(row?.down ?? 0) }
}

export async function selectMetricIdsBefore(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await getDb().selectFrom('network_metrics').select('id').where('timestamp', '<', toDbTime(cutoff)).limit(limit).execute()
  return rows.map((r) => r.id)
}

export async function deleteMetricsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await getDb().deleteFrom('network_metrics').where('id', 'in', ids).executeTakeFirst()
  return Number(res.numDeletedRows)
}

export async function insertScan(s: Omit<ScanHistory, 'id' | 'createdAt'>): Promise<void> {
  await getDb()
    .insertInto('network_scan_history')
    .values({
      id: randomUUID(),
      scanner_name: s.scannerName,
      scan_duration: Math.round(s.scanDurationMs),
      device_count: s.deviceCount,
      success_count: s.successCount,
      failure_count: s.failureCount,
      status: s.status,
      error_message: s.errorMessage,
      created_at: nowDb(),
    })
    .execute()
}

export async function latestScan(): Promise<ScanHistory | null> {
  const row = await getDb()
    .selectFrom('network_scan_history')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ? rowToScanHistory(row) : null
}

export async function latestSuccessfulScanAt(): Promise<Date | null> {
  const row = await getDb()
    .selectFrom('network_scan_history')
    .select((eb) => eb.fn.max('created_at').as('ts'))
    .where('status', '!=', 'failed')
    .executeTakeFirst()
  return row?.ts ? fromDbTime(String(row.ts)) : null
}

export async function deleteScansBefore(cutoff: Date): Promise<number> {
  const res = await getDb().deleteFrom('network_scan_history').where('created_at', '<', toDbTime(cutoff)).executeTakeFirst()
  return Number(res.numDeletedRows)
}
