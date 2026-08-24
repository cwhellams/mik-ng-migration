import { createHash, randomBytes } from 'node:crypto'
import { getRandomInt } from '../../util/math-utils.ts'
import { corsOrigins } from '../../util/corsOrigins.ts'

if (!process.env.PUBLIC_URL) {
  throw new Error('PUBLIC_URL is not defined in environment variables')
}

// Default callback host — the member app. Used when the login request carries
// no Origin header we recognise (e.g. a same-origin form post, or the request
// simply predates the admin app existing).
const defaultOrigin = process.env.PUBLIC_URL

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
 * Picks which app's `/login/validate` a magic link should open.
 *
 * The member and admin apps are separate subdomains (#1233), each with its
 * own `/login/validate` page, so a link built from one global default would
 * always land a login started on the admin app back in the member app
 * instead. The request's `Origin` header says which app actually asked — the
 * same one already sends it on every credentialed cross-origin call this API
 * accepts — so it is trusted here too, but only after checking it against
 * `corsOrigins`: the same allowlist CORS itself enforces. An unrecognised or
 * missing Origin (same-origin requests can omit it) falls back to the member
 * app, the historical default before the admin app existed.
 */
export function resolveMagicLinkOrigin(requestOrigin: string | undefined): string {
  return requestOrigin && corsOrigins.includes(requestOrigin) ? requestOrigin : defaultOrigin
}

/**
 * Build the magic-link href that is embedded in the login email.
 * The raw token is placed in the URL query parameter; the frontend
 * POSTs it to /api/auth/login/validate for server-side verification.
 */
export function buildMagicLinkHref(token: string, origin: string, target?: string): string {
  const targetParam = target ? `&target=${encodeURIComponent(target)}` : ''
  return `${origin}/login/validate?token=${token}${targetParam}`
}

/** Generate a 5-digit numeric login code for PWA entry. */
export function generateLoginCode(): number {
  return getRandomInt(10000, 99999)
}
