import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)

  await tableOptions(
    db,
    db.schema
      .createTable('device_categories')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('name', t.varchar(100), (c) => c.notNull())
      .addColumn('color', t.varchar(7), (c) => c.notNull().defaultTo('#3b82f6'))
      .addColumn('icon', t.varchar(50))
      .addColumn('description', t.text)
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_dc_name', ['name']),
  ).execute()

  await tableOptions(
    db,
    db.schema
      .createTable('devices')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('mac_address', t.varchar(17), (c) => c.notNull())
      .addColumn('ip_address', t.varchar(45), (c) => c.notNull())
      .addColumn('hostname', t.varchar(255))
      .addColumn('device_name', t.varchar(255))
      .addColumn('device_type', t.varchar(50), (c) => c.notNull().defaultTo('unknown'))
      .addColumn('manufacturer', t.varchar(255))
      .addColumn('signal_strength', t.int)
      .addColumn('status', t.varchar(20), (c) => c.notNull().defaultTo('offline'))
      .addColumn('is_blocked', t.bool, (c) => c.notNull().defaultTo(0))
      .addColumn('is_ignored', t.bool, (c) => c.notNull().defaultTo(0))
      .addColumn('total_connection_time', t.bigint, (c) => c.notNull().defaultTo(0))
      .addColumn('category_id', t.uuid)
      .addColumn('first_seen', t.datetime, (c) => c.notNull())
      .addColumn('last_seen', t.datetime, (c) => c.notNull())
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_devices_mac', ['mac_address'])
      .addForeignKeyConstraint('fk_devices_category', ['category_id'], 'device_categories', ['id'], (fk) =>
        fk.onDelete('set null'),
      ),
  ).execute()

  await db.schema.createIndex('idx_devices_status').on('devices').column('status').execute()
  await db.schema.createIndex('idx_devices_last_seen').on('devices').column('last_seen').execute()
  await db.schema.createIndex('idx_devices_category').on('devices').column('category_id').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('devices').execute()
  await db.schema.dropTable('device_categories').execute()
}
