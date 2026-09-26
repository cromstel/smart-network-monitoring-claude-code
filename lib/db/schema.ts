/**
 * Kysely table interfaces. Column names are snake_case exactly as in docs/DATABASE.md.
 *
 * Read-side representations are normalised in `mappers.ts`:
 *   - timestamps are written and read as 'YYYY-MM-DD HH:MM:SS.mmm' UTC strings on both dialects
 *     (mysql2 runs with dateStrings: true), so comparisons are identical everywhere;
 *   - BIGINT arrives as string (MySQL, bigNumberStrings) or number (SQLite) — mapped to string;
 *   - booleans arrive as 0/1 — mapped to boolean. better-sqlite3 cannot bind JS booleans, so
 *     writes always use 0/1.
 */
import type { ColumnType, Insertable, Selectable, Updateable } from 'kysely'

export type Timestamp = ColumnType<string, string, string>
export type NullableTimestamp = ColumnType<string | null, string | null | undefined, string | null>
export type BigIntCol = ColumnType<string | number, string | number | undefined, string | number>
export type Bool = ColumnType<number, number | undefined, number>

export interface DeviceCategoriesTable {
  id: string
  name: string
  color: ColumnType<string, string | undefined, string>
  icon: string | null
  description: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface DevicesTable {
  id: string
  mac_address: string
  ip_address: string
  hostname: string | null
  device_name: string | null
  device_type: ColumnType<string, string | undefined, string>
  manufacturer: string | null
  signal_strength: number | null
  status: ColumnType<string, string | undefined, string>
  is_blocked: Bool
  is_ignored: Bool
  total_connection_time: BigIntCol
  category_id: string | null
  first_seen: Timestamp
  last_seen: Timestamp
  created_at: Timestamp
  updated_at: Timestamp
}

export interface BandwidthMetricsTable {
  id: string
  device_id: string
  timestamp: Timestamp
  upload_speed: number
  download_speed: number
  upload_total: BigIntCol
  download_total: BigIntCol
  created_at: Timestamp
}

export interface BandwidthHourlyTable {
  id: string
  device_id: string
  hour_start: Timestamp
  avg_upload_speed: number
  avg_download_speed: number
  peak_upload_speed: number
  peak_download_speed: number
  bytes_uploaded: BigIntCol
  bytes_downloaded: BigIntCol
  sample_count: number
  created_at: Timestamp
}

export interface ConnectionLogsTable {
  id: string
  device_id: string
  event_type: string
  timestamp: Timestamp
  ip_address: string | null
  connection_duration: number | null
  created_at: Timestamp
}

export interface UsersTable {
  id: string
  email: string
  password_hash: string
  name: string | null
  role: ColumnType<string, string | undefined, string>
  is_active: Bool
  last_login_at: NullableTimestamp
  created_at: Timestamp
  updated_at: Timestamp
}

export interface SessionsTable {
  id: string
  user_id: string
  token_hash: string
  expires_at: Timestamp
  ip_address: string | null
  user_agent: string | null
  created_at: Timestamp
}

export interface UserSettingsTable {
  id: string
  user_id: string
  scan_interval_seconds: ColumnType<number, number | undefined, number>
  data_retention_days: ColumnType<number, number | undefined, number>
  network_subnet: ColumnType<string, string | undefined, string>
  ignore_subnets: string | null
  notify_new_devices: Bool
  notify_device_offline: Bool
  notify_high_bandwidth: Bool
  bandwidth_threshold: ColumnType<number, number | undefined, number>
  theme: ColumnType<string, string | undefined, string>
  created_at: Timestamp
  updated_at: Timestamp
}

export interface DeviceAlertsTable {
  id: string
  user_id: string
  device_id: string | null
  alert_type: string
  threshold: number | null
  is_active: Bool
  last_triggered: NullableTimestamp
  trigger_count: ColumnType<number, number | undefined, number>
  created_at: Timestamp
  updated_at: Timestamp
}

export interface NotificationsTable {
  id: string
  user_id: string
  device_id: string | null
  alert_id: string | null
  title: string
  message: string
  type: ColumnType<string, string | undefined, string>
  priority: ColumnType<string, string | undefined, string>
  is_read: Bool
  read_at: NullableTimestamp
  data: string | null
  created_at: Timestamp
}

export interface RouterConfigTable {
  id: string
  router_type: string
  router_name: string | null
  router_ip: string
  port: ColumnType<number, number | undefined, number>
  username: string
  password_encrypted: string
  mac_address: string | null
  model_number: string | null
  firmware_version: string | null
  is_connected: Bool
  last_check_at: NullableTimestamp
  last_success_at: NullableTimestamp
  created_at: Timestamp
  updated_at: Timestamp
}

export interface NetworkMetricsTable {
  id: string
  timestamp: Timestamp
  total_bandwidth_up: number
  total_bandwidth_down: number
  active_devices: number
  online_devices: number
  peak_bandwidth_up: number
  peak_bandwidth_down: number
  created_at: Timestamp
}

export interface NetworkScanHistoryTable {
  id: string
  scanner_name: string
  scan_duration: number
  device_count: ColumnType<number, number | undefined, number>
  success_count: ColumnType<number, number | undefined, number>
  failure_count: ColumnType<number, number | undefined, number>
  status: string
  error_message: string | null
  created_at: Timestamp
}

export interface DB {
  device_categories: DeviceCategoriesTable
  devices: DevicesTable
  bandwidth_metrics: BandwidthMetricsTable
  bandwidth_hourly: BandwidthHourlyTable
  connection_logs: ConnectionLogsTable
  users: UsersTable
  sessions: SessionsTable
  user_settings: UserSettingsTable
  device_alerts: DeviceAlertsTable
  notifications: NotificationsTable
  router_config: RouterConfigTable
  network_metrics: NetworkMetricsTable
  network_scan_history: NetworkScanHistoryTable
}

export type DeviceRow = Selectable<DevicesTable>
export type NewDeviceRow = Insertable<DevicesTable>
export type DeviceUpdate = Updateable<DevicesTable>
export type BandwidthMetricRow = Selectable<BandwidthMetricsTable>
export type BandwidthHourlyRow = Selectable<BandwidthHourlyTable>
export type ConnectionLogRow = Selectable<ConnectionLogsTable>
export type CategoryRow = Selectable<DeviceCategoriesTable>
export type UserRow = Selectable<UsersTable>
export type SessionRow = Selectable<SessionsTable>
export type UserSettingsRow = Selectable<UserSettingsTable>
export type DeviceAlertRow = Selectable<DeviceAlertsTable>
export type NotificationRow = Selectable<NotificationsTable>
export type RouterConfigRow = Selectable<RouterConfigTable>
export type NetworkMetricRow = Selectable<NetworkMetricsTable>
export type ScanHistoryRow = Selectable<NetworkScanHistoryTable>
