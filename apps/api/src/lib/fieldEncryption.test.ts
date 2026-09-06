import { describe, expect, it } from 'vitest'

import { runWithContext } from '../context'
import type { Env } from '../env'
import { base64ToBytes } from './bytes'
import { FieldEncryptionConfigError, decryptField, encryptField } from './fieldEncryption'

/**
 * The key the fixtures below were produced with. Obviously fake, and only ever
 * used here.
 */
const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

/**
 * Ciphertext written by **the Node implementation**
 * (apps/backend/src/lib/fieldEncryption.ts), captured by running it under that
 * key. These are the point of this file: every encrypted HETU in the members
 * table was written by that code, and if this port cannot read its output the
 * data is unrecoverable. Regenerate with:
 *
 *   cd apps/backend && FIELD_ENCRYPTION_KEY=<key> npx tsx --eval \
 *     "import {encryptField} from './src/lib/fieldEncryption.ts'; console.log(encryptField('...'))"
 */
const NODE_FIXTURES = [
  {
    name: 'a HETU, the field this exists for',
    plaintext: '123456-789A',
    ciphertext: 'mzuJ3blKcOI/jCfA:B5yjwNPIzDk9Lz4=:eKeT41AtlRKKoJaKiHc08Q==',
  },
  {
    name: 'multi-byte UTF-8',
    plaintext: 'ÄÖÅ ääkkösiä ja emojia 🛩️',
    ciphertext:
      'gtRPmwS7G5Qzsx54:kp1RcE242V2oniMdoRl8U+Y1jDk5DHklLycr5BXAzp09xk4EpA==:C+CqwderYTmlVQfqg2+L/g==',
  },
  {
    // Encrypts to an empty middle segment, so 'iv::tag' has to survive the
    // split-on-colon parse rather than looking malformed.
    name: 'the empty string',
    plaintext: '',
    ciphertext: 'Rwb+gPJojbNwFgRx::rDHHJ6NqyKVHz6DdDKPTjw==',
  },
]

const withKey = <T>(key: string | undefined, fn: () => T): T =>
  runWithContext(
    {
      env: { LEGACY_ORIGIN: 'https://legacy.example.test', FIELD_ENCRYPTION_KEY: key } as Env,
      ctx: {} as ExecutionContext,
    },
    fn,
  )

describe('reading what the Node implementation wrote', () => {
  it.each(NODE_FIXTURES)('decrypts $name', async ({ plaintext, ciphertext }) => {
    // The migration is one-way for this data. Node's GCM keeps the auth tag
    // separate; WebCrypto appends it to the ciphertext. If that difference were
    // handled wrongly this is the assertion that would say so — and nothing
    // else would, because encryption would still produce plausible base64.
    await withKey(KEY, async () => {
      expect(await decryptField(ciphertext)).toBe(plaintext)
    })
  })
})

describe('writing what the Node implementation can read', () => {
  // Rollback matters as much as cutover: while both backends are live, a row
  // written here may be read there.
  it('emits iv:ciphertext:tag with a 12-byte iv and a 16-byte tag', async () => {
    await withKey(KEY, async () => {
      const [iv, ciphertext, tag] = (await encryptField('123456-789A')).split(':')

      expect(base64ToBytes(iv)).toHaveLength(12)
      expect(base64ToBytes(tag)).toHaveLength(16)
      expect(base64ToBytes(ciphertext)).toHaveLength('123456-789A'.length)
    })
  })

  it('uses a fresh iv every time', async () => {
    await withKey(KEY, async () => {
      const [a, b] = await Promise.all([encryptField('same'), encryptField('same')])
      expect(a).not.toBe(b)
    })
  })

  it.each(NODE_FIXTURES)('round-trips $name', async ({ plaintext }) => {
    await withKey(KEY, async () => {
      expect(await decryptField(await encryptField(plaintext))).toBe(plaintext)
    })
  })
})

describe('rejection', () => {
  it('refuses a tampered ciphertext', async () => {
    await withKey(KEY, async () => {
      const [iv, , tag] = NODE_FIXTURES[0].ciphertext.split(':')
      await expect(decryptField(`${iv}:AAAAAAAAAAAAAAA=:${tag}`)).rejects.toThrow()
    })
  })

  it('refuses a tampered tag', async () => {
    await withKey(KEY, async () => {
      const [iv, data] = NODE_FIXTURES[0].ciphertext.split(':')
      await expect(decryptField(`${iv}:${data}:AAAAAAAAAAAAAAAAAAAAAA==`)).rejects.toThrow()
    })
  })

  it('refuses a value that is not three colon-separated parts', async () => {
    await withKey(KEY, async () => {
      await expect(decryptField('not-encrypted')).rejects.toThrow('Invalid encrypted field format')
    })
  })

  it.each([
    ['missing', undefined],
    ['too short', 'abc'],
  ])('throws a config error, not a decrypt error, for a %s key', async (_name, key) => {
    // The distinction is load-bearing: callers that tolerate one bad row must
    // let this one propagate, because it means the deploy is misconfigured
    // rather than that a single row is corrupt.
    await withKey(key, async () => {
      await expect(encryptField('x')).rejects.toThrow(FieldEncryptionConfigError)
    })
  })
})
