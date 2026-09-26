/** User administration (ADMIN only; enforced here as well as in the route). */
import * as userRepo from '@/lib/db/repositories/userRepository'
import * as settingsRepo from '@/lib/db/repositories/settingsRepository'
import { AppError, conflict, forbidden, notFound } from '@/lib/api/errors'
import { hashPassword } from '@/lib/security/password'
import type { Role, User } from '@/lib/types'
import { getNetworkSettings } from './settingsService'

function requireAdmin(caller: { role: Role }): void {
  if (caller.role !== 'ADMIN') throw forbidden()
}

export async function listUsers(caller: { role: Role }): Promise<User[]> {
  requireAdmin(caller)
  return userRepo.list()
}

export async function createUser(
  caller: { role: Role },
  input: { email: string; password: string; name: string | null; role: Role },
): Promise<User> {
  requireAdmin(caller)
  if (await userRepo.findByEmail(input.email)) throw conflict('A user with that email already exists.')
  const user = await userRepo.create({ email: input.email, passwordHash: await hashPassword(input.password), name: input.name, role: input.role })
  await settingsRepo.createForUser(user.id, await getNetworkSettings())
  return user
}

/** Refuses any change that would leave the installation without an active admin. */
async function guardLastAdmin(target: User, next: { role?: Role; isActive?: boolean; deleting?: boolean }): Promise<void> {
  const losesAdmin = target.role === 'ADMIN' && target.isActive && (next.deleting || next.isActive === false || (next.role !== undefined && next.role !== 'ADMIN'))
  if (losesAdmin && (await userRepo.countActiveAdmins()) <= 1) {
    throw new AppError('CONFLICT', 'The last active admin cannot be demoted, deactivated, or deleted.')
  }
}

export async function updateUser(
  caller: { id: string; role: Role },
  id: string,
  patch: { name?: string | null; role?: Role; isActive?: boolean; password?: string },
): Promise<User> {
  requireAdmin(caller)
  const target = await userRepo.findById(id)
  if (!target) throw notFound('User')
  await guardLastAdmin(target, patch)
  const updated = await userRepo.update(id, {
    name: patch.name,
    role: patch.role,
    isActive: patch.isActive,
    ...(patch.password ? { passwordHash: await hashPassword(patch.password) } : {}),
  })
  if (!updated) throw notFound('User')
  if (patch.isActive === false || patch.password) await userRepo.deleteSessionsForUser(id)
  return updated
}

export async function deleteUser(caller: { id: string; role: Role }, id: string): Promise<void> {
  requireAdmin(caller)
  if (caller.id === id) throw new AppError('CONFLICT', 'You cannot delete your own account.')
  const target = await userRepo.findById(id)
  if (!target) throw notFound('User')
  await guardLastAdmin(target, { deleting: true })
  await userRepo.deleteById(id)
}
