import type { MiddlewareHandler } from 'hono'

import { isPorted } from './config'
import { getEnv } from './context'

/**
 * The strangler facade.
 *
 * Anything not in the ported list goes to the legacy Express backend untouched
 * and comes back untouched. That is what makes each domain's cutover
 * independently shippable, and its rollback a one-line config change rather
 * than a revert.
 *
 * It runs *before* the rest of the middleware stack rather than as a
 * last-resort route, so a proxied response is genuinely unmodified: the legacy
 * backend still runs helmet and still owns its own error format, and stamping
 * this Worker's headers on top would at best duplicate them.
 */
export const strangler: MiddlewareHandler = async (c, next) => {
  if (isPorted(c.req.path)) return next()

  const url = new URL(c.req.url)
  const target = new URL(url.pathname + url.search, getEnv().LEGACY_ORIGIN)

  const proxied = new Request(target, c.req.raw)
  // The Host header becomes the origin's, so the browser-facing hostname has to
  // travel separately. Phase 7 resolves the tenant from it.
  proxied.headers.set('X-Forwarded-Host', url.host)
  proxied.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))

  // Not followed here: the legacy backend answers 302 from /t/:code to a
  // presigned storage URL, and following it would stream the file through this
  // Worker under a URL the browser never navigated to.
  return fetch(proxied, { redirect: 'manual' })
}
