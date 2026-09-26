import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)
  await tableOptions(
    db,
    db.schema
      .createTable('user_settings')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('user_id', t.uuid, (c) => c.notNull())
      .addColumn('scan_interval_seconds', t.int, (c) => c.notNull().defaultTo(30))
      .addColumn('data_retention_days', t.int, (c) => c.notNull().defaultTo(30))
      .addColumn('network_subnet', t.varchar(64), (c) => c.notNull().defaultTo('192.168.1.0/24'))
      .addColumn('ignore_subnets', t.text)
      .addColumn('notify_new_devices', t.bool, (c) => c.notNull().defaultTo(1))
      .addColumn('notify_device_offline', t.bool, (c) => c.notNull().defaultTo(1))
      .addColumn('notify_high_bandwidth', t.bool, (c) => c.notNull().defaultTo(0))
      .addColumn('bandwidth_threshold', t.double, (c) => c.notNull().defaultTo(100))
      .addColumn('theme', t.varchar(10), (c) => c.notNull().defaultTo('dark'))
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_us_user', ['user_id'])
      .addForeignKeyConstraint('fk_us_user', ['user_id'], 'users', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()

  // password_encrypted, not password: a plaintext write is visibly wrong at the call site (A-09).
  await tableOptions(
    db,
    db.schema
      .createTable('router_config')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('router_type', t.varchar(50), (c) => c.notNull())
      .addColumn('router_name', t.varchar(255))
      .addColumn('router_ip', t.varchar(45), (c) => c.notNull())
      .addColumn('port', t.int, (c) => c.notNull().defaultTo(80))
      .addColumn('username', t.varchar(255), (c) => c.notNull())
      .addColumn('password_encrypted', t.text, (c) => c.notNull())
      .addColumn('mac_address', t.varchar(17))
      .addColumn('model_number', t.varchar(100))
      .addColumn('firmware_version', t.varchar(100))
      .addColumn('is_connected', t.bool, (c) => c.notNull().defaultTo(0))
      .addColumn('last_check_at', t.datetime)
      .addColumn('last_success_at', t.datetime)
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_rc_ip', ['router_ip']),
  ).execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('router_config').execute()
  await db.schema.dropTable('user_settings').execute()
}
