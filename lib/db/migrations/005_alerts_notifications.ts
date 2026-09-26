import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)
  // Alert RULES. user_id is the owner and every query filters by it (PRD F-34).
  await tableOptions(
    db,
    db.schema
      .createTable('device_alerts')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('user_id', t.uuid, (c) => c.notNull())
      .addColumn('device_id', t.uuid)
      .addColumn('alert_type', t.varchar(50), (c) => c.notNull())
      .addColumn('threshold', t.double)
      .addColumn('is_active', t.bool, (c) => c.notNull().defaultTo(1))
      .addColumn('last_triggered', t.datetime)
      .addColumn('trigger_count', t.int, (c) => c.notNull().defaultTo(0))
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addForeignKeyConstraint('fk_da_user', ['user_id'], 'users', ['id'], (fk) => fk.onDelete('cascade'))
      .addForeignKeyConstraint('fk_da_device', ['device_id'], 'devices', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()
  await db.schema.createIndex('idx_da_user').on('device_alerts').column('user_id').execute()
  await db.schema.createIndex('idx_da_device').on('device_alerts').column('device_id').execute()

  // Alert INSTANCES, delivered to one user.
  await tableOptions(
    db,
    db.schema
      .createTable('notifications')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('user_id', t.uuid, (c) => c.notNull())
      .addColumn('device_id', t.uuid)
      .addColumn('alert_id', t.uuid)
      .addColumn('title', t.varchar(255), (c) => c.notNull())
      .addColumn('message', t.text, (c) => c.notNull())
      .addColumn('type', t.varchar(20), (c) => c.notNull().defaultTo('info'))
      .addColumn('priority', t.varchar(10), (c) => c.notNull().defaultTo('medium'))
      .addColumn('is_read', t.bool, (c) => c.notNull().defaultTo(0))
      .addColumn('read_at', t.datetime)
      .addColumn('data', t.text)
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addForeignKeyConstraint('fk_n_user', ['user_id'], 'users', ['id'], (fk) => fk.onDelete('cascade'))
      .addForeignKeyConstraint('fk_n_device', ['device_id'], 'devices', ['id'], (fk) => fk.onDelete('set null')),
  ).execute()
  await db.schema.createIndex('idx_n_user_read').on('notifications').columns(['user_id', 'is_read']).execute()
  await db.schema.createIndex('idx_n_created').on('notifications').column('created_at').execute()
  await db.schema.createIndex('idx_n_alert_device').on('notifications').columns(['alert_id', 'device_id']).execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('notifications').execute()
  await db.schema.dropTable('device_alerts').execute()
}
