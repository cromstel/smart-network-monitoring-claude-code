import { randomUUID } from 'node:crypto'
import { getDb } from '../client'
import { nowDb } from '../time'
import type { DeviceCategory } from '@/lib/types'
import { rowToCategory } from './mappers'

export async function list(): Promise<DeviceCategory[]> {
  const rows = await getDb().selectFrom('device_categories').selectAll().orderBy('name', 'asc').execute()
  return rows.map(rowToCategory)
}

export async function findById(id: string): Promise<DeviceCategory | null> {
  const row = await getDb().selectFrom('device_categories').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? rowToCategory(row) : null
}

export async function findByName(name: string): Promise<DeviceCategory | null> {
  const row = await getDb().selectFrom('device_categories').selectAll().where('name', '=', name).executeTakeFirst()
  return row ? rowToCategory(row) : null
}

export async function create(input: { name: string; color: string; icon: string | null; description: string | null }): Promise<DeviceCategory> {
  const id = randomUUID()
  const now = nowDb()
  await getDb()
    .insertInto('device_categories')
    .values({ id, name: input.name, color: input.color, icon: input.icon, description: input.description, created_at: now, updated_at: now })
    .execute()
  const created = await findById(id)
  if (!created) throw new Error('category insert did not persist')
  return created
}
