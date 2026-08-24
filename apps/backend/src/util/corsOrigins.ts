import logger from '../lib/logger.ts'

/**
 * Canonicalise one configured entry into the exact string a browser sends in
 * its `Origin` header: scheme + host + non-default port, lowercased, with no
 * path and **no trailing slash**.
 *
 * The normalisation is not cosmetic. Origin headers never carry a trailing
 * slash, and the allowlist is matched by exact string equality, so a perfectly
 * reasonable-looking `https://twr.mik.fi/` in the env var silently matches
 * nothing — no `Access-Control-Allow-Origin` header, and every request from
 * that app dies in preflight. That cost a beta outage once already.
 *
 * Returns undefined for an entry that is not a parseable absolute URL, so a
 * typo is dropped loudly rather than sitting in the list matching nothing.
 */
const normaliseOrigin = (entry: string): string | undefined => {
  try {
    return new URL(entry).origin
  } catch {
    logger.warn('CORS_ALLOWED_ORIGINS: ignoring unparseable origin %j', entry)
    return undefined
  }
}

// Parse CORS allowed origins from comma-separated environment variable.
// Wildcard ('*') is explicitly rejected — it cannot be used with credentialed requests
// (httpOnly cookies) as required by the CORS spec.
export const parseAllowedOrigins = (raw: string | undefined): string[] =>
  raw
    ? raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0 && origin !== '*')
        .map(normaliseOrigin)
        .filter((origin): origin is string => origin !== undefined)
    : []

const rawOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS)

/**
 * The origins allowed to make credentialed cross-origin requests to this API —
 * currently the member app and the admin app's own subdomains.
 *
 * Shared between `app.ts`'s CORS middleware and `magiclink.ts`'s callback-host
 * selection, which both need the same allowlist: a magic link must open the
 * app that requested it, and the only safe way to know which app that was is
 * to check its `Origin` header against the same list CORS already trusts.
 * Split out here rather than exported from `app.ts` to avoid a cycle — `app.ts`
 * mounts `routes/auth/login.ts`, which needs this list.
 */
export let corsOrigins: string[]

if (rawOrigins.length === 0) {
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      'CORS_ALLOWED_ORIGINS is not configured — cross-origin requests will be rejected. ' +
        'Set it to your frontend origins (e.g. https://intra.mik.fi,https://twr.mik.fi).',
    )
    corsOrigins = []
  } else {
    logger.warn(
      'CORS_ALLOWED_ORIGINS not set — defaulting to http://localhost:5173 and ' +
        'http://localhost:5174, the member and admin apps’ own Vite ports (local dev only)',
    )
    corsOrigins = ['http://localhost:5173', 'http://localhost:5174']
  }
} else {
  corsOrigins = rawOrigins
}
