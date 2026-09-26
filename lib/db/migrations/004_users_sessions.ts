import type { MigrationDb } from './_helpers'
import { tableOptions, types } from './_helpers'

export async function up(db: MigrationDb): Promise<void> {
  const t = types(db)
  await tableOptions(
    db,
    db.schema
      .createTable('users')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('email', t.varchar(255), (c) => c.notNull())
      .addColumn('password_hash', t.varchar(255), (c) => c.notNull())
      .addColumn('name', t.varchar(255))
      .addColumn('role', t.varchar(20), (c) => c.notNull().defaultTo('VIEWER'))
      .addColumn('is_active', t.bool, (c) => c.notNull().defaultTo(1))
      .addColumn('last_login_at', t.datetime)
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addColumn('updated_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_users_email', ['email']),
  ).execute()

  await tableOptions(
    db,
    db.schema
      .createTable('sessions')
      .addColumn('id', t.uuid, (c) => c.primaryKey().notNull())
      .addColumn('user_id', t.uuid, (c) => c.notNull())
      .addColumn('token_hash', t.varchar(255), (c) => c.notNull())
      .addColumn('expires_at', t.datetime, (c) => c.notNull())
      .addColumn('ip_address', t.varchar(45))
      .addColumn('user_agent', t.varchar(512))
      .addColumn('created_at', t.datetime, (c) => c.notNull())
      .addUniqueConstraint('uq_sessions_token', ['token_hash'])
      .addForeignKeyConstraint('fk_sessions_user', ['user_id'], 'users', ['id'], (fk) => fk.onDelete('cascade')),
  ).execute()
  await db.schema.createIndex('idx_sessions_user').on('sessions').column('user_id').execute()
  await db.schema.createIndex('idx_sessions_expires').on('sessions').column('expires_at').execute()
}

export async function down(db: MigrationDb): Promise<void> {
  await db.schema.dropTable('sessions').execute()
  await db.schema.dropTable('users').execute()
}
