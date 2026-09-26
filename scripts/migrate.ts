/** npm run db:migrate | db:migrate:down */
import { closeDb, getDb } from '../lib/db/client'
import { migrateDown, migrateToLatest } from '../lib/db/migrator'
import { loadEnv } from './env'

async function main() {
  loadEnv()
  const direction = process.argv[2] ?? 'latest'
  const db = getDb()
  const applied = direction === 'down' ? await migrateDown(db) : await migrateToLatest(db)
  console.log(applied.length ? `${direction === 'down' ? 'Rolled back' : 'Applied'}: ${applied.join(', ')}` : 'Nothing to do — schema is current.')
  await closeDb()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await closeDb()
  process.exit(1)
})
