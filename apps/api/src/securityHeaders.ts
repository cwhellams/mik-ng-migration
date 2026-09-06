import type { MiddlewareHandler } from 'hono'

/**
 * The response headers apps/backend sets today, reproduced exactly.
 *
 * These are `helmet@8.3.0`'s defaults as configured in
 * apps/backend/src/app.ts — captured from helmet itself rather than
 * transcribed from its README, since the point is parity and a header that
 * quietly stops being sent is not something a test would otherwise notice.
 *
 * Two are deliberately absent, both because the Cloudflare edge rule owns them
 * and a second copy would be a duplicate header:
 *   - Content-Security-Policy (see FALLBACK_CSP below)
 *   - Strict-Transport-Security
 */
const HELMET_DEFAULTS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  // 0, per OWASP/MDN: the legacy XSS auditor is itself a vulnerability.
  'X-XSS-Protection': '0',
}

/** helmet v8 does not emit this one; apps/backend adds it by hand (issue #1149). */
const PERMISSIONS_POLICY = 'geolocation=(), camera=(), microphone=(), payment=(), usb=()'

/**
 * `helmet.contentSecurityPolicy()`'s default policy, again captured from
 * helmet, and applied only when the request did not come through Cloudflare.
 *
 * Cloudflare stamps `CF-Ray` on everything it proxies, so its absence means the
 * edge rule that normally supplies the CSP never ran and the response would
 * leave with none at all. Gating on the header is also what stops a
 * Cloudflare-proxied response ending up with two CSP headers.
 */
const FALLBACK_CSP =
  "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';" +
  "frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';" +
  "script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"

/**
 * Applied to responses this Worker generates, and deliberately not to proxied
 * ones: the legacy backend still runs helmet, so re-stamping its responses
 * would be at best redundant and at worst a duplicate CSP. See `proxy.ts`,
 * which runs ahead of this middleware for exactly that reason.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()

  for (const [name, value] of Object.entries(HELMET_DEFAULTS)) {
    c.header(name, value)
  }
  c.header('Permissions-Policy', PERMISSIONS_POLICY)

  if (!c.req.header('cf-ray')) {
    c.header('Content-Security-Policy', FALLBACK_CSP)
  }
}
