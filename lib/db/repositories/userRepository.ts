import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { getDb } from '../client'
import type { DB } from '../schema'
import { nowDb, toCount, toDbBool, toDbTime } from '../time'
import type { Role, Session, User } from '@/lib/types'
import { rowToSession, rowToUser } from './mappers'

// password_hash is selected in exactly one function below and never mapped onto User.
const PUBLIC_COLUMNS = ['id', 'email', 'name', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at'] as const

export async function countUsers(exec: Kysely<DB> = getDb()): Promise<number> {
  const row = await exec.selectFrom('users').select((eb) => eb.fn.countAll().as('n')).executeTakeFirst()
  return toCount(row?.n)
}

export async function countActiveAdmins(): Promise<number> {
  const row = await getDb()
    .selectFrom('users')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('role', '=', 'ADMIN')
    .where('is_active', '=', 1)
    .executeTakeFirst()
  return toCount(row?.n)
}

export async function create(
  input: { email: string; passwordHash: string; name: string | null; role: Role },
  exec: Kysely<DB> = getDb(),
): Promise<User> {
  const id = randomUUID()
  const now = nowDb()
  await exec
    .insertInto('users')
    .values({
      id,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      name: input.name,
      role: input.role,
      is_active: 1,
      created_at: now,
      updated_at: now,
    })
    .execute()
  const row = await exec.selectFrom('users').select(PUBLIC_COLUMNS).where('id', '=', id).executeTakeFirstOrThrow()
  return rowToUser(row)
}

export async function findById(id: string): Promise<User | null> {
  const row = await getDb().selectFrom('users').select(PUBLIC_COLUMNS).where('id', '=', id).executeTakeFirst()
  return row ? rowToUser(row) : null
}

export async function findByEmail(email: string): Promise<User | null> {
  const row = await getDb()
    .selectFrom('users')
    .select(PUBLIC_COLUMNS)
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst()
  return row ? rowToUser(row) : null
}

/** For credential verification in authService only. */
export async function findCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
  const row = await getDb().selectFrom('users').selectAll().where('email', '=', email.toLowerCase()).executeTakeFirst()
  if (!row) return null
  const { password_hash: passwordHash, ...rest } = row
  return { user: rowToUser(rest), passwordHash }
}

export async function findCredentialsById(id: string): Promise<{ user: User; passwordHash: string } | null> {
  const row = await getDb().selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return null
  const { password_hash: passwordHash, ...rest } = row
  return { user: rowToUser(rest), passwordHash }
}

export async function list(): Promise<User[]> {
  const rows = await getDb().selectFrom('users').select(PUBLIC_COLUMNS).orderBy('created_at', 'asc').execute()
  return rows.map(rowToUser)
}

export async function listActive(): Promise<User[]> {
  const rows = await getDb().selectFrom('users').select(PUBLIC_COLUMNS).where('is_active', '=', 1).execute()
  return rows.map(rowToUser)
}

export async function oldestActiveAdmin(): Promise<User | null> {
  const row = await getDb()
    .selectFrom('users')
    .select(PUBLIC_COLUMNS)
    .where('role', '=', 'ADMIN')
    .where('is_active', '=', 1)
    .orderBy('created_at', 'asc')
    .executeTakeFirst()
  return row ? rowToUser(row) : null
}

export async function update(
  id: string,
  patch: { name?: string | null; role?: Role; isActive?: boolean; passwordHash?: string },
): Promise<User | null> {
  const set: { updated_at: string; name?: string | null; role?: string; is_active?: number; password_hash?: string } = {
    updated_at: nowDb(),
  }
  if (patch.name !== undefined) set.name = patch.name
  if (patch.role !== undefined) set.role = patch.role
  if (patch.isActive !== undefined) set.is_active = toDbBool(patch.isActive)
  if (patch.passwordHash !== undefined) set.password_hash = patch.passwordHash
  await getDb().updateTable('users').set(set).where('id', '=', id).execute()
  return findById(id)
}

export async function touchLastLogin(id: string): Promise<void> {
  await getDb().updateTable('users').set({ last_login_at: nowDb() }).where('id', '=', id).execute()
}

export async function deleteById(id: string): Promise<boolean> {
  const res = await getDb().deleteFrom('users').where('id', '=', id).executeTakeFirst()
  return Number(res.numDeletedRows) > 0
}

// ---- sessions -------------------------------------------------------------------------------

export async function createSession(input: {
  userId: string
  tokenHash: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
}): Promise<Session> {
  const id = randomUUID()
  await getDb()
    .insertInto('sessions')
    .values({
      id,
      user_id: input.userId,
      token_hash: input.tokenHash,
      expires_at: toDbTime(input.expiresAt),
      ip_address: input.ipAddress,
      user_agent: input.userAgent ? input.userAgent.slice(0, 512) : null,
      created_at: nowDb(),
    })
    .execute()
  const row = await getDb().selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  return rowToSession(row)
}

export async function findSessionWithUser(tokenHash: string): Promise<{ session: Session; user: User } | null> {
  const row = await getDb()
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'sessions.id as s_id',
      'sessions.user_id as s_user_id',
      'sessions.token_hash as s_token_hash',
      'sessions.expires_at as s_expires_at',
      'sessions.ip_address as s_ip_address',
      'sessions.user_agent as s_user_agent',
      'sessions.created_at as s_created_at',
      'users.id',
      'users.email',
      'users.name',
      'users.role',
      'users.is_active',
      'users.last_login_at',
      'users.created_at',
      'users.updated_at',
    ])
    .where('sessions.token_hash', '=', tokenHash)
    .executeTakeFirst()
  if (!row) return null
  return {
    session: rowToSession({
      id: row.s_id,
      user_id: row.s_user_id,
      token_hash: row.s_token_hash,
      expires_at: row.s_expires_at,
      ip_address: row.s_ip_address,
      user_agent: row.s_user_agent,
      created_at: row.s_created_at,
    }),
    user: rowToUser(row),
  }
}

export async function extendSession(id: string, expiresAt: Date): Promise<void> {
  await getDb().updateTable('sessions').set({ expires_at: toDbTime(expiresAt) }).where('id', '=', id).execute()
}

export async function deleteSession(id: string): Promise<void> {
  await getDb().deleteFrom('sessions').where('id', '=', id).execute()
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await getDb().deleteFrom('sessions').where('user_id', '=', userId).execute()
}

export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const res = await getDb().deleteFrom('sessions').where('expires_at', '<', toDbTime(now)).executeTakeFirst()
  return Number(res.numDeletedRows)
}
