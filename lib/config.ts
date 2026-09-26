import { z } from 'zod'
import { isValidCidr } from '@/lib/utils/network'

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const hex64 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32')

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_CLIENT: z.enum(['sqlite', 'mysql']).default('sqlite'),
  DB_FILE: z.string().min(1).default('./data/dev.db'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().default('home_monitor'),
  DB_USER: z.string().default('monitor'),
  DB_PASSWORD: z.string().default(''),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters. Generate with: openssl rand -hex 32'),
  ENCRYPTION_KEY: hex64,
  NETWORK_SUBNET: z
    .string()
    .default('192.168.1.0/24')
    .refine(isValidCidr, 'must be an IPv4 CIDR such as 192.168.1.0/24'),
  SCANNER_MODE: z.enum(['simulated', 'arp', 'asus']).default('simulated'),
  SCAN_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(30),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTO_MIGRATE: booleanString.default('true'),
  SCHEDULER_ENABLED: booleanString.default('true'),
  /** Defaults to true in production. Set false only for plain-HTTP access on a trusted LAN. */
  COOKIE_SECURE: booleanString.optional(),
})

const schema = baseSchema.superRefine((env, ctx) => {
  if (env.DB_CLIENT === 'mysql') {
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER'] as const) {
      if (!env[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'required when DB_CLIENT=mysql' })
    }
  }
})

export type AppConfig = z.infer<typeof baseSchema>

let cached: AppConfig | null = null

/**
 * Validated configuration. Evaluated lazily (so `next build` can import route modules
 * without a populated environment) and exactly once per process. A missing or malformed
 * variable throws with a message naming it.
 */
export function getConfig(): AppConfig {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example.`)
  }
  cached = parsed.data
  return cached
}

/** Test hook: forget the cached config so a changed process.env is re-read. */
export function resetConfigForTests(): void {
  cached = null
}
