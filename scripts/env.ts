/** Minimal .env loader for CLI scripts (Next.js loads .env itself for the app). */
import fs from 'node:fs'
import path from 'node:path'

export function loadEnv(file = '.env'): void {
  const full = path.resolve(process.cwd(), file)
  if (!fs.existsSync(full)) return
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || !m[1]) continue
    let value = (m[2] ?? '').replace(/\s+#.*$/, '')
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
}
