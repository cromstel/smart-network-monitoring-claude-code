import pino from 'pino'

const g = globalThis as unknown as { __snmLogger?: pino.Logger }

export const logger: pino.Logger =
  g.__snmLogger ??
  pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { app: 'smart-network-monitoring' },
    redact: {
      paths: [
        'password',
        'passwordHash',
        'password_hash',
        'password_encrypted',
        'routerPassword',
        'token',
        'secret',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.secret',
        '*.authorization',
        '*.cookie',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[redacted]',
    },
  })

g.__snmLogger = logger
