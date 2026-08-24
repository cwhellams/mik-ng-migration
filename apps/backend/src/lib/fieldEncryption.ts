/**
 * AES-256-GCM field-level encryption for GDPR-sensitive data.
 *
 * Usage:
 *   const encrypted = encryptField('123456-789A')   // store in DB
 *   const plain     = decryptField(encrypted)       // read from DB
 *
 * Key is read from FIELD_ENCRYPTION_KEY (32-byte hex string, 64 hex chars).
 * If the key is absent the functions throw so the problem is caught early.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // 96-bit IV recommended for GCM

// Thrown for a missing/malformed FIELD_ENCRYPTION_KEY, as opposed to a bad ciphertext.
// Callers that tolerate per-row decryption failures (e.g. to keep a list endpoint from
// 500ing on one corrupted row) should let this one propagate instead of swallowing it -
// it means the deploy is misconfigured, not that one row is bad.
export class FieldEncryptionConfigError extends Error {}

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new FieldEncryptionConfigError(
      'FIELD_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts a plaintext string.
 * Returns a base64 string in the format:  <iv>:<ciphertext>:<authTag>
 */
export function encryptField(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':')
}

/**
 * Decrypts a value produced by encryptField.
 * Returns the original plaintext string.
 */
export function decryptField(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted field format')
  const [ivB64, dataB64, tagB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
