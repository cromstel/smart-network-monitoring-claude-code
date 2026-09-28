import { type Kysely } from 'kysely'
import { Migrator, NO_MIGRATIONS, type Migration, type MigrationProvider, type MigrationResultSet } from 'kysely/migration'
import { getDb } from './client'
import type { DB } from './schema'
import * as m001 from './migrations/001_devices'
import * as m002 from './migrations/002_bandwidth_metrics'
import * as m003 from './migrations/003_connection_logs'
import * as m004 from './migrations/004_users_sessions'
import * as m005 from './migrations/005_alerts_notifications'
import * as m006 from './migrations/006_settings_router'
import * as m007 from './migrations/007_network_metrics'

/**
 * Static provider: migrations are imported, not discovered on disk, so they survive bundling
 * (the server runs from .next/standalone where lib/db/migrations/*.ts does not exist).
 * Never edit a migration that has run anywhere — add a new one.
 */
const MIGRATIONS: Record<string, Migration> = {
  '001_devices': m001 as Migration,
  '002_bandwidth_metrics': m002 as Migration,
  '003_connection_logs': m003 as Migration,
  '004_users_sessions': m004 as Migration,
  '005_alerts_notifications': m005 as Migration,
  '006_settings_router': m006 as Migration,
  '007_network_metrics': m007 as Migration,
}

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return MIGRATIONS
  }
}

function migrator(db: Kysely<DB>): Migrator {
  return new Migrator({ db, provider: new StaticMigrationProvider() })
}

function unwrap(result: MigrationResultSet): string[] {
  if (result.error) {
    const failed = result.results?.find((r) => r.status === 'Error')
    const reason = result.error instanceof Error ? result.error.message : String(result.error)
    throw new Error(`Migration ${failed?.migrationName ?? '(unknown)'} failed: ${reason}`)
  }
  return (result.results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName)
}

export async function migrateToLatest(db: Kysely<DB> = getDb()): Promise<string[]> {
  return unwrap(await migrator(db).migrateToLatest())
}

export async function migrateDown(db: Kysely<DB> = getDb()): Promise<string[]> {
  return unwrap(await migrator(db).migrateDown())
}

/** Roll back every migration. Tests only. */
export async function migrateToZero(db: Kysely<DB> = getDb()): Promise<void> {
  unwrap(await migrator(db).migrateTo(NO_MIGRATIONS))
}

export const MIGRATION_NAMES = Object.keys(MIGRATIONS)
