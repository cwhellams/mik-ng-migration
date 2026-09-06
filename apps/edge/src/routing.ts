/**
 * Routing decisions for the edge Worker, kept as pure functions so they can be
 * tested without a workerd runtime or a real assets binding.
 *
 * The Worker serves two kinds of thing from one origin:
 *
 *   - static assets — the two built SPA bundles, answered from the Static
 *     Assets binding, each with an index.html fallback so its client-side
 *     routes deep-link;
 *   - everything the API owns, proxied to the legacy backend.
 *
 * Same-origin is the point. DigitalOcean's ingress puts the SPA and the API on
 * one hostname today, and three things depend on that: the auth cookie, the
 * absence of a CORS preflight on every call, and the service worker's
 * hand-tuned `/t/*` rules (`navigateFallbackDenylist` in
 * apps/frontend/vite.config.ts). Splitting them would break all three.
 */

/**
 * Path prefixes the API origin owns, taken from the `app.use()` mounts in
 * apps/backend/src/app.ts:
 *
 *   /api     every route domain, including /api/auth
 *   /t       tiny-URL redirects for documents and QR codes
 *   /health  the platform health check
 *
 * Auth is *not* at /auth — it is mounted under /api/auth. A bare /auth prefix
 * here would proxy a path the backend answers 404 for.
 */
export const ORIGIN_PREFIXES = ['/api', '/t', '/health'] as const

/** Whether the request belongs to the API origin rather than the static bundle. */
export function isOriginPath(pathname: string): boolean {
  return ORIGIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Where the admin bundle (apps/admin) is mounted.
 *
 * It is a path here rather than the separate subdomain DigitalOcean gives it,
 * so that the two apps share an origin. That is what lets the auth cookie be
 * host-only — see the COOKIE_DOMAIN/COOKIE_PREFIX history in
 * apps/backend/src/routes/auth/cookies.ts, where a cookie shared across
 * subdomains took production down — and it removes CORS from every admin call.
 * The admin bundle must be built with a matching Vite `base`.
 */
export const ADMIN_BASE = '/admin'

/**
 * The index.html to serve when no asset matches, or null to let the 404 stand.
 *
 * Which index matters: the two apps are separate bundles, so an admin
 * deep-link answered with the member app's index.html silently loads the wrong
 * application.
 *
 * Only navigations get the fallback. A miss on a hashed `.js` or `.css` chunk
 * must stay a 404: answering it with HTML is what produces the classic
 * "Unexpected token '<'" in the browser console, which is a far harder failure
 * to read than a plain 404 on the chunk that is actually missing.
 */
export function spaFallbackFor(request: Request): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (!request.headers.get('accept')?.includes('text/html')) return null

  const { pathname } = new URL(request.url)
  const isAdmin = pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`)
  return isAdmin ? `${ADMIN_BASE}/index.html` : '/index.html'
}
