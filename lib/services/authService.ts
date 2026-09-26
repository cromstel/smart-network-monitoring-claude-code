import { getConfig } from '@/lib/config'
import { getDb } from '@/lib/db/client'
import * as userRepo from '@/lib/db/repositories/userRepository'
import * as settingsRepo from '@/lib/db/repositories/settingsRepository'
import { AppError, conflict, unauthenticated } from '@/lib/api/errors'
import { DUMMY_HASH, hashPassword, verifyPassword } from '@/lib/security/password'
import { SESSION_REFRESH_THRESHOLD_MS, SESSION_TTL_MS, generateToken, hashToken } from '@/lib/security/tokens'
import type { Session, User } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import { getNetworkSettings } from './settingsService'

export interface AuthContext {
  user: User
  session: Session
}

export interface LoginResult {
  user: User
  token: string
  expiresAt: Date
}

function tokenHash(token: string): string {
  return hashToken(token, getConfig().SESSION_SECRET)
}

/** Same outcome and similar timing whether the email is unknown or the password is wrong. */
export async function login(email: string, password: string, meta: { ip: string | null; userAgent: string | null }): Promise<LoginResult> {
  const found = await userRepo.findCredentialsByEmail(email)
  const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH)
  if (!found || !ok || !found.user.isActive) {
    logger.info({ ip: meta.ip }, 'login failed')
    throw unauthenticated('Invalid email or password.')
  }
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await userRepo.createSession({ userId: found.user.id, tokenHash: tokenHash(token), expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent })
  await userRepo.touchLastLogin(found.user.id)
  logger.info({ userId: found.user.id }, 'login succeeded')
  return { user: found.user, token, expiresAt }
}

/** Resolves a cookie token to a live session. Expired sessions are deleted; sliding 7-day expiry. */
export async function validateSession(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token || token.length < 20 || token.length > 200) return null
  const found = await userRepo.findSessionWithUser(tokenHash(token))
  if (!found) return null
  const now = Date.now()
  if (found.session.expiresAt.getTime() <= now) {
    await userRepo.deleteSession(found.session.id)
    return null
  }
  if (!found.user.isActive) return null
  if (found.session.expiresAt.getTime() - now < SESSION_REFRESH_THRESHOLD_MS) {
    const expiresAt = new Date(now + SESSION_TTL_MS)
    await userRepo.extendSession(found.session.id, expiresAt)
    found.session.expiresAt = expiresAt
  }
  return found
}

export async function logout(token: string | undefined | null): Promise<void> {
  if (!token) return
  const found = await userRepo.findSessionWithUser(tokenHash(token))
  if (found) await userRepo.deleteSession(found.session.id)
}

export async function needsSetup(): Promise<boolean> {
  return (await userRepo.countUsers()) === 0
}

/** First-run: create the initial ADMIN (PRD F-63). Refused once any user exists. */
export async function setup(input: { email: string; password: string; name: string | null }): Promise<User> {
  const passwordHash = await hashPassword(input.password)
  const network = await getNetworkSettings()
  const user = await getDb()
    .transaction()
    .execute(async (trx) => {
      if ((await userRepo.countUsers(trx)) > 0) throw conflict('Setup has already been completed.')
      const created = await userRepo.create({ email: input.email, passwordHash, name: input.name, role: 'ADMIN' }, trx)
      await settingsRepo.createForUser(created.id, network, trx)
      return created
    })
  logger.info({ userId: user.id }, 'initial admin created')
  return user
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const found = await userRepo.findCredentialsById(userId)
  if (!found || !(await verifyPassword(currentPassword, found.passwordHash))) {
    throw new AppError('INVALID_BODY', 'Current password is incorrect.', { fieldErrors: { currentPassword: ['Current password is incorrect.'] } })
  }
  await userRepo.update(userId, { passwordHash: await hashPassword(newPassword) })
}
