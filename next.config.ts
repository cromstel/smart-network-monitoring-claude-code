import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone; `npm start` uses the regular build.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // Native / Node-only modules must not be bundled.
  serverExternalPackages: ['better-sqlite3', 'mysql2', 'pino', 'node-cron', 'bcryptjs', 'oui-data'],
  // kysely is ESM-only; next/jest uses this list to un-ignore its node_modules
  // paths so SWC transforms it to CJS for the Jest (require) runtime.
  transpilePackages: ['kysely'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
