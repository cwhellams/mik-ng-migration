import { createHash, randomBytes } from 'node:crypto'
import { getRandomInt } from '../../util/math-utils.ts'

if (!process.env.PUBLIC_URL) {
  throw new Error('PUBLIC_URL is not defined in environment variables')
}

// The authentication callback URL — where the frontend handles magic-link clicks
const callbackUrl = `${process.env.PUBLIC_URL}/login/validate`

/**
 * Generate a cryptographically random opaque magic-link token.
 * Returns both the raw token (for embedding in the email URL) and its
 * SHA-256 hex hash (for storing in the database). Only the hash is persisted,
 * so a database breach does not expose usable tokens.
 */
export function generateMagicLinkToken(): { token: string; tokenHash: string } {
  const token = randomBytes(64).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

/**
 * Build the magic-link href that is embedded in the login email.
 * The raw token is placed in the URL query parameter; the frontend
 * POSTs it to /api/auth/login/validate for server-side verification.
 */
export function buildMagicLinkHref(token: string, target?: string): string {
  const targetParam = target ? `&target=${encodeURIComponent(target)}` : ''
  return `${callbackUrl}?token=${token}${targetParam}`
}

/** Generate a 5-digit numeric login code for PWA entry. */
export function generateLoginCode(): number {
  return getRandomInt(10000, 99999)
}
