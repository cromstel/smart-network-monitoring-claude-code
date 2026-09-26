/**
 * The ONLY module that constructs a database connection (AUDIT A-08).
 *
 * The instance is cached on globalThis — always, not only in development. Next.js bundles
 * instrumentation.ts (which starts the scheduler) separately from route handlers, so a plain
 * module-level singleton would give each bundle its own pool.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Kysely, MysqlDialect, SqliteDialect } from 'kysely'
import type { DB } from './schema'

export type DbClient = 'mysql' | 'sqlite'

interface Handle {
  db: Kysely<DB>
  client: DbClient
}

const g = globalThis as unknown as { __snmDb?: Handle }

export interface ConnectionOptions {
  client: DbClient
  file?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  connectionLimit?: number
}

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const client: DbClient = env.DB_CLIENT === 'mysql' ? 'mysql' : 'sqlite'
  return {
    client,
    file: env.DB_FILE ?? './data/dev.db',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  }
}

export function createDb(opts: ConnectionOptions): Kysely<DB> {
  if (opts.client === 'mysql') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- keep the driver out of the SQLite path
    const { createPool } = require('mysql2') as typeof import('mysql2')
    return new Kysely<DB>({
      dialect: new MysqlDialect({
        pool: createPool({
          host: opts.host,
          port: opts.port ?? 3306,
          user: opts.user,
          password: opts.password,
          database: opts.database,
          connectionLimit: opts.connectionLimit ?? 10,
          timezone: 'Z',
          dateStrings: true, // DATETIME -> 'YYYY-MM-DD HH:MM:SS.mmm', same as SQLite
          supportBigNumbers: true,
          bigNumberStrings: true, // BIGINT -> string, never a JS bigint (AUDIT A-05)
          charset: 'utf8mb4',
        }),
      }),
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded only for SQLite
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const file = opts.file ?? './data/dev.db'
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const sqlite = new Database(file)
  // SQLite ignores foreign keys unless enabled on every connection (DATABASE.md, dialect table).
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  if (file !== ':memory:') sqlite.pragma('journal_mode = WAL')
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
}

export function getDb(): Kysely<DB> {
  if (!g.__snmDb) {
    const opts = optionsFromEnv()
    g.__snmDb = { db: createDb(opts), client: opts.client }
  }
  return g.__snmDb.db
}

export function getDbClient(): DbClient {
  if (g.__snmDb) return g.__snmDb.client
  return optionsFromEnv().client
}

/** Tests and scripts: install a specific instance as the process-wide one. */
export function setDb(db: Kysely<DB>, client: DbClient): void {
  g.__snmDb = { db, client }
}

export async function closeDb(): Promise<void> {
  const handle = g.__snmDb
  g.__snmDb = undefined
  if (handle) await handle.db.destroy()
}
