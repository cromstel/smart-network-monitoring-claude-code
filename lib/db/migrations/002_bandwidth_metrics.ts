import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)

  await tableOptions(
    db,
    db.schema
      .createTable('bandwidth_metrics')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('device_id', t.uuid, (c) => c.notNull())
      .addColumn('timestamp', t.datetime, (c) => c.notNull())
      .addColumn('upload_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('download_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('upload_total', t.bigint, (c) => c.notNull().defaultTo(0))
      .addColumn('download_total', t.bigint, (c) => c.notNull().defaultTo(0))
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addForeignKeyConstraint('fk_bm_device', ['device_id'], 'devices', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()
  // carries every history query
  await db.schema.createIndex('idx_bm_device_time').on('bandwidth_metrics').columns(['device_id', 'timestamp']).execute()
  // carries retention pruning
  await db.schema.createIndex('idx_bm_timestamp').on('bandwidth_metrics').column('timestamp').execute()

  await tableOptions(
    db,
    db.schema
      .createTable('bandwidth_hourly')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('device_id', t.uuid, (c) => c.notNull())
      .addColumn('hour_start', t.datetime, (c) => c.notNull())
      .addColumn('avg_upload_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('avg_download_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('peak_upload_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('peak_download_speed', t.double, (c) => c.notNull().defaultTo(0))
      .addColumn('bytes_uploaded', t.bigint, (c) => c.notNull().defaultTo(0))
      .addColumn('bytes_downloaded', t.bigint, (c) => c.notNull().defaultTo(0))
      .addColumn('sample_count', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      // makes the rollup idempotent
      .addUniqueConstraint('uq_bh_device_hour', ['device_id', 'hour_start'])
      .addForeignKeyConstraint('fk_bh_device', ['device_id'], 'devices', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()
  await db.schema.createIndex('idx_bh_hour').on('bandwidth_hourly').column('hour_start').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('bandwidth_hourly').execute()
  await db.schema.dropTable('bandwidth_metrics').execute()
}
