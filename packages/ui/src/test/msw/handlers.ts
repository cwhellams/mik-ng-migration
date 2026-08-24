import { http, HttpResponse } from 'msw'

import { aMember, aMemberRolesResponse } from '../fixtures'

/**
 * Builds a matcher for an API path.
 *
 * `useApi` sends requests to `${VITE_API_TARGET ?? ''}/api/…`, which under
 * jsdom means a same-origin relative URL. The leading `*` makes the matcher
 * origin-agnostic so handlers keep working if `VITE_API_TARGET` is ever set.
 */
export const apiUrl = (path: string) => `*/api/${path.replace(/^\//, '')}`

/**
 * Default handlers.
 *
 * Far shorter than either app's, because nothing here renders an app shell:
 * the token refresh `useApi`'s 401 interceptor posts to before retrying, and
 * the two identity endpoints `useMe`/`useRoles` read. The default member is an
 * *ordinary* member — `signInAs` in `../auth` is how a test asks for anyone
 * else. Everything feature-specific is registered by the test that wants it,
 * via `server.use(...)`.
 */
export const handlers = [
  http.post(apiUrl('auth/refresh'), () => HttpResponse.json({})),
  http.get(apiUrl('v1/members/me'), () => HttpResponse.json(aMember())),
  http.get(apiUrl('v1/members/roles'), () => HttpResponse.json(aMemberRolesResponse())),
]

/** RFC 9457 problem response with the minimal fields (`status`, `detail`) returned for error scenarios. */
export const problemResponse = (status: number, detail: string) =>
  HttpResponse.json({ status, detail }, { status })
