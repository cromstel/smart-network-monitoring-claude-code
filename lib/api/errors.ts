/** Typed errors thrown by services and mapped to the API error envelope in one place. */

export type ErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_BODY'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ROUTER_UNREACHABLE'
  | 'ROUTER_UNSUPPORTED'
  | 'SCANNER_UNAVAILABLE'
  | 'INTERNAL'

export const STATUS: Record<ErrorCode, number> = {
  INVALID_QUERY: 400,
  INVALID_BODY: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ROUTER_UNREACHABLE: 503,
  ROUTER_UNSUPPORTED: 503,
  SCANNER_UNAVAILABLE: 503,
  INTERNAL: 500,
}

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'AppError'
  }
  get status(): number {
    return STATUS[this.code]
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`)
export const forbidden = (message = 'You do not have permission to do that.') => new AppError('FORBIDDEN', message)
export const unauthenticated = (message = 'Sign in to continue.') => new AppError('UNAUTHENTICATED', message)
export const conflict = (message: string) => new AppError('CONFLICT', message)
export const invalidBody = (details: unknown, message = 'The request body is invalid.') =>
  new AppError('INVALID_BODY', message, details)
export const invalidQuery = (details: unknown, message = 'The query parameters are invalid.') =>
  new AppError('INVALID_QUERY', message, details)
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError('RATE_LIMITED', 'Too many requests. Try again later.', undefined, retryAfterSeconds)
