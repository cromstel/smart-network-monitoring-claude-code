import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)
  await tableOptions(
    db,
    db.schema
      .createTable('network_metrics')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('timestamp', t.datetime, (c) => c.notNull())
      .addColumn('total_bandwidth_up', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('total_bandwidth_down', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('active_devices', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('online_devices', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('peak_bandwidth_up', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('peak_bandwidth_down', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('created_at', t.datetime, (c) => c.notNull()),
  ).execute()
  await db.schema.createIndex('idx_nm_timestamp').on('network_metrics').column('timestamp').execute()

  await tableOptions(
    db,
    db.schema
      .createTable('network_scan_history')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('scanner_name', t.varchar(20), (c) => c.notNull())
      .addColumn('scan_duration', t.int, (c) => c.notNull())
      .addColumn('device_count', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('success_count', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('failure_count', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('status', t.varchar(20), (c) => c.notNull())
      .addColumn('error_message', t.text)
      .addColumn('created_at', t.datetime, (c) => c.notNull()),
  ).execute()
  await db.schema.createIndex('idx_nsh_created').on('network_scan_history').column('created_at').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('network_scan_history').execute()
  await db.schema.dropTable('network_metrics').execute()
}
