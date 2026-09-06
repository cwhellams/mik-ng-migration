import jwt from 'jsonwebtoken'

import { decryptField, encryptField } from '../../src/lib/fieldEncryption.ts'

/**
 * The other half of the crypto migration's safety net.
 *
 * apps/api reimplements field encryption on WebCrypto and JWTs on `jose`,
 * because neither `node:crypto`'s cipher API nor `jsonwebtoken` runs on
 * workerd. Its own tests prove it can read what *this* implementation wrote —
 * which is what stops the existing encrypted HETUs becoming unreadable.
 *
 * This file proves the converse: that this implementation can read what the
 * Worker wrote. That matters for as long as the strangler migration runs, which
 * is months. Both backends are live at once, either may write a row or mint a
 * cookie, and either may be asked to read it back — including after a rollback,
 * when rows written by the Worker are suddenly being read only by this code.
 *
 * The fixtures were produced by apps/api's implementations under the throwaway
 * key and secret below. If either side's format drifts, one of these two files
 * fails.
 */

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const SECRET = 'test-access-secret'

const WORKER_CIPHERTEXTS = [
  {
    name: 'a HETU, the field this exists for',
    plaintext: '123456-789A',
    ciphertext: '6GYIMZFf7TUI/nvA:vKc/Ar5mMpycG6U=:b1yazsrB8YaXQpjPs2XZwQ==',
  },
  {
    name: 'multi-byte UTF-8',
    plaintext: 'ÄÖÅ ääkkösiä ja emojia 🛩️',
    ciphertext:
      'GMM3qthX7DfVHNs2:gW8Edlhx74eNhATOYJveiao2ISYT1RyJCJRXe44wgAAQrhcGgQ==:8WdBRHlap0WUceLiJgajsA==',
  },
  {
    // Encrypts to an empty middle segment, so 'iv::tag' has to survive this
    // side's split-on-colon parse too.
    name: 'the empty string',
    plaintext: '',
    ciphertext: 'fJ4uLGYaPXjIlmLR::yVaMOiXBGai4cMf99FB/sw==',
  },
]

/**
 * An access token signed by apps/api with `jose`, expiring in 2126. Same
 * HS256, same iss/aud/jti shape `generateAccessToken` produces here.
 */
const WORKER_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZW1iZXJJZCI6ImZpX3Rlc3QxIiwic2lkIjoic2Vzcy0xIiwiaWF0Ijox' +
  'Nzg4NzAzNDIxLCJpc3MiOiJtaWsiLCJhdWQiOiJhcGkiLCJleHAiOjQ5NDQ0NjM0MjEsImp0aSI6IjAwMDAwMDAwLTAwMDAtN' +
  'DAwMC04MDAwLTAwMDAwMDAwMDAwMCJ9.tvb4iLTcm5f4HUQ1FMUUhbQXwh5yhBBIH9icf0Vix40'

describe('field encryption written by apps/api', () => {
  const previousKey = process.env.FIELD_ENCRYPTION_KEY

  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = KEY
  })
  afterAll(() => {
    process.env.FIELD_ENCRYPTION_KEY = previousKey
  })

  it.each(WORKER_CIPHERTEXTS)('decrypts $name', ({ plaintext, ciphertext }) => {
    // Node's GCM takes the auth tag separately; WebCrypto appends it to the
    // ciphertext. This is the assertion that says the Worker split it back off
    // correctly on the way out.
    expect(decryptField(ciphertext)).toBe(plaintext)
  })

  it('produces the same three-part shape the Worker does', () => {
    const [iv, , tag] = encryptField('123456-789A').split(':')
    const [workerIv, , workerTag] = WORKER_CIPHERTEXTS[0].ciphertext.split(':')

    expect(Buffer.from(iv, 'base64')).toHaveLength(Buffer.from(workerIv, 'base64').length)
    expect(Buffer.from(tag, 'base64')).toHaveLength(Buffer.from(workerTag, 'base64').length)
  })
})

describe('a token minted by apps/api', () => {
  it('verifies here, with its claims intact', () => {
    // While both backends are live a member's cookie reaches whichever one owns
    // the path, so a token minted there has to be accepted here.
    const payload = jwt.verify(WORKER_TOKEN, SECRET, {
      issuer: 'mik',
      audience: 'api',
    }) as { memberId: string; sid: string; jti: string }

    expect(payload.memberId).toBe('fi_test1')
    expect(payload.sid).toBe('sess-1')
    expect(payload.jti).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('is rejected here under the wrong secret', () => {
    expect(() => jwt.verify(WORKER_TOKEN, 'not-the-secret')).toThrow()
  })

  it('is rejected here for the refresh audience', () => {
    expect(() => jwt.verify(WORKER_TOKEN, SECRET, { issuer: 'mik', audience: 'refresh' })).toThrow()
  })
})
