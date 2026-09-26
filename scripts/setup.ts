/**
 * npm run setup [-- --mysql] [-- --subnet 192.168.0.0/24] [-- --scanner arp]
 *
 * Replaces the deleted installer scripts (AUDIT A-20) and configures THIS application:
 *   1. creates .env from .env.example if missing,
 *   2. generates SESSION_SECRET and ENCRYPTION_KEY where empty (never overwrites existing ones —
 *      changing ENCRYPTION_KEY would make stored router credentials unreadable),
 *   3. applies database migrations.
 * The first admin is created in the browser at /setup.
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { closeDb, getDb } from '../lib/db/client'
import { migrateToLatest } from '../lib/db/migrator'
import { isValidCidr } from '../lib/utils/network'
import { loadEnv } from './env'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function setVar(text: string, key: string, value: string, onlyIfEmpty: boolean): string {
  const re = new RegExp(`^${key}=(.*)$`, 'm')
  const match = re.exec(text)
  if (!match) return `${text.trimEnd()}\n${key}=${value}\n`
  const current = (match[1] ?? '').replace(/\s+#.*$/, '').trim()
  if (onlyIfEmpty && current) return text
  return text.replace(re, `${key}=${value}`)
}

async function main() {
  const root = process.cwd()
  const envPath = path.join(root, '.env')
  const examplePath = path.join(root, '.env.example')
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.readFileSync(examplePath, 'utf8')
  const createdEnv = !fs.existsSync(envPath)

  text = setVar(text, 'SESSION_SECRET', randomBytes(32).toString('hex'), true)
  text = setVar(text, 'ENCRYPTION_KEY', randomBytes(32).toString('hex'), true)
  if (process.argv.includes('--mysql')) text = setVar(text, 'DB_CLIENT', 'mysql', false)
  const subnet = arg('subnet')
  if (subnet) {
    if (!isValidCidr(subnet)) throw new Error(`--subnet ${subnet} is not a valid IPv4 CIDR`)
    text = setVar(text, 'NETWORK_SUBNET', subnet, false)
  }
  const scanner = arg('scanner')
  if (scanner) {
    if (!['simulated', 'arp', 'asus'].includes(scanner)) throw new Error('--scanner must be simulated, arp or asus')
    text = setVar(text, 'SCANNER_MODE', scanner, false)
  }
  fs.writeFileSync(envPath, text, { mode: 0o600 })
  console.log(createdEnv ? 'Created .env with fresh secrets.' : 'Updated .env (existing secrets kept).')

  loadEnv()
  if (process.env.DB_CLIENT === 'mysql' && !process.env.DB_PASSWORD) {
    console.log('DB_CLIENT=mysql: fill in DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in .env, then run `npm run db:migrate`.')
    return
  }
  const applied = await migrateToLatest(getDb())
  console.log(applied.length ? `Migrations applied: ${applied.join(', ')}` : 'Database schema is current.')
  console.log('\nNext:\n  npm run dev        (or: npm run build && npm start)\n  open http://localhost:3000/setup to create the first admin')
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err)
    await closeDb()
    process.exit(1)
  })
