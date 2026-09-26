import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)
  await tableOptions(
    db,
    db.schema
      .createTable('connection_logs')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('device_id', t.uuid, (c) => c.notNull())
      .addColumn('event_type', t.varchar(20), (c) => c.notNull())
      .addColumn('timestamp', t.datetime, (c) => c.notNull())
      .addColumn('ip_address', t.varchar(45))
      .addColumn('connection_duration', t.int)
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addForeignKeyConstraint('fk_cl_device', ['device_id'], 'devices', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()
  await db.schema.createIndex('idx_cl_device_time').on('connection_logs').columns(['device_id', 'timestamp']).execute()
  await db.schema.createIndex('idx_cl_event').on('connection_logs').column('event_type').execute()
  await db.schema.createIndex('idx_cl_timestamp').on('connection_logs').column('timestamp').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('connection_logs').execute()
}
