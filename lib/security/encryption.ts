/**
 * AES-256-GCM for router credentials (PRD F-40, AUDIT A-09).
 * Stored format: `iv:authTag:ciphertext`, each hex. The key comes from ENCRYPTION_KEY.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function keyFrom(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string, keyHex: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, keyFrom(keyHex), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decrypt(payload: string, keyHex: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('encrypted payload is malformed')
  const [ivHex, tagHex, dataHex] = parts as [string, string, string]
  const decipher = createDecipheriv(ALGORITHM, keyFrom(keyHex), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}

export function looksEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value)
}
