import bcrypt from 'bcryptjs'

export const BCRYPT_COST = 12 // PRD F-60: cost >= 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Compared against when the email does not exist, so a miss costs the same time as a hit
 * and response timing does not reveal which accounts exist.
 */
export const DUMMY_HASH = '$2b$12$22nAritfMjDKeVwxy2akgOXpu6iXMQHgBoEGzqLFe40UfhZmp/ARK'
