import { decrypt, encrypt, looksEncrypted } from '@/lib/security/encryption'
import { generateToken, hashToken, safeEqual } from '@/lib/security/tokens'
import { BCRYPT_COST, hashPassword, verifyPassword } from '@/lib/security/password'

const KEY = 'a'.repeat(64)

describe('AES-256-GCM router credential encryption', () => {
  it('round-trips and stores iv:authTag:ciphertext', () => {
    const payload = encrypt('s3cret-router-pw', KEY)
    expect(payload.split(':')).toHaveLength(3)
    expect(looksEncrypted(payload)).toBe(true)
    expect(payload).not.toContain('s3cret')
    expect(decrypt(payload, KEY)).toBe('s3cret-router-pw')
  })
  it('uses a fresh IV every time', () => {
    expect(encrypt('same', KEY)).not.toBe(encrypt('same', KEY))
  })
  it('rejects tampering and the wrong key', () => {
    const payload = encrypt('pw', KEY)
    const [iv, tag, data] = payload.split(':') as [string, string, string]
    const flipped = `${iv}:${tag}:${data.slice(0, -2)}${data.slice(-2) === '00' ? '01' : '00'}`
    expect(() => decrypt(flipped, KEY)).toThrow()
    expect(() => decrypt(payload, 'b'.repeat(64))).toThrow()
    expect(() => decrypt('nope', KEY)).toThrow('malformed')
  })
  it('refuses a malformed key', () => {
    expect(() => encrypt('x', 'short')).toThrow('ENCRYPTION_KEY')
  })
})

describe('session tokens', () => {
  it('are long, random and hashed with the secret', () => {
    const a = generateToken()
    expect(a.length).toBeGreaterThanOrEqual(43)
    expect(a).not.toBe(generateToken())
    expect(hashToken(a, 'secret-1')).not.toBe(hashToken(a, 'secret-2'))
    expect(hashToken(a, 'secret-1')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('passwords', () => {
  it('uses bcrypt with cost >= 12 (PRD F-60)', async () => {
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(12)
    const hash = await hashPassword('correct horse battery')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(await verifyPassword('correct horse battery', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
