/**
 * AES-256-GCM field-level encryption for GDPR-sensitive data, on WebCrypto.
 *
 * A port of apps/backend/src/lib/fieldEncryption.ts, and the **stored format is
 * unchanged** — `<iv>:<ciphertext>:<authTag>`, each part base64. It has to be:
 * every encrypted HETU already in the database was written by the Node version,
 * and this one has to read them. The interop fixtures in the test file are
 * ciphertext produced by that implementation, and they are the actual guarantee.
 *
 * The one thing that genuinely differs between the two crypto APIs is where the
 * authentication tag lives. Node's GCM keeps it separate, retrieved with
 * `cipher.getAuthTag()`. WebCrypto has no such call: it **appends the 16-byte
 * tag to the ciphertext**. So encryption splits the tail off, and decryption
 * puts it back. Get that wrong and nothing fails loudly — encryption still
 * produces plausible base64, and only decryption of the resulting rows fails,
 * by which time they are written.
 *
 * Both functions are async, which the Node versions were not: importing a key
 * through `crypto.subtle` returns a promise. Call sites need `await` when their
 * domain ports.
 */

import { getEnv } from '../context'
import { base64ToBytes, bytesToBase64, concatBytes, hexToBytes } from './bytes'

const IV_BYTES = 12 // 96-bit IV, as recommended for GCM
const TAG_BYTES = 16 // 128-bit tag, WebCrypto's default and Node's

/**
 * Thrown for a missing or malformed FIELD_ENCRYPTION_KEY, as opposed to a bad
 * ciphertext. Callers that tolerate per-row decryption failures (to keep a list
 * endpoint from 500ing on one corrupted row) should let this one propagate
 * instead of swallowing it — it means the deploy is misconfigured, not that one
 * row is bad.
 */
export class FieldEncryptionConfigError extends Error {}

const getKey = async (): Promise<CryptoKey> => {
  const hex = getEnv().FIELD_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new FieldEncryptionConfigError(
      'FIELD_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    )
  }
  return crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Encrypts a plaintext string into `<iv>:<ciphertext>:<authTag>`, each base64. */
export async function encryptField(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  )
  // WebCrypto returns ciphertext||tag; the stored format keeps them apart.
  const ciphertext = sealed.subarray(0, sealed.length - TAG_BYTES)
  const tag = sealed.subarray(sealed.length - TAG_BYTES)

  return [bytesToBase64(iv), bytesToBase64(ciphertext), bytesToBase64(tag)].join(':')
}

/** Decrypts a value produced by either implementation of `encryptField`. */
export async function decryptField(stored: string): Promise<string> {
  const key = await getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted field format')
  const [ivB64, dataB64, tagB64] = parts

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
    key,
    // Reassemble what WebCrypto expects: ciphertext with the tag appended.
    concatBytes(base64ToBytes(dataB64), base64ToBytes(tagB64)),
  )
  return new TextDecoder().decode(plaintext)
}
