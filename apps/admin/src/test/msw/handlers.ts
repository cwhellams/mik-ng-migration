import { http, HttpResponse } from 'msw'

import {
  ALL_PERMISSIONS,
  aMemberListResponse,
  aMemberRolesResponse,
  anAdmin,
  aRoleWithPermissions,
} from '../fixtures'

/**
 * Builds a matcher for an API path.
 *
 * `useApi` sends requests to `${VITE_API_TARGET ?? ''}/api/…`, which under
 * jsdom means a same-origin relative URL. The leading `*` makes the matcher
 * origin-agnostic so handlers keep working if `VITE_API_TARGET` is ever set.
 */
export const apiUrl = (path: string) => `*/api/${path.replace(/^\//, '')}`

/**
 * Default happy-path handlers.
 *
 * Only the endpoints the admin shell hits on essentially every render — who am
 * I, what can I do. Note the default identity is an **admin**, not an ordinary
 * member as in `apps/frontend`: every page in this app is behind a permission
 * gate, so a member-by-default would make every unrelated test assert on the
 * 403 page. Tests that care about the gate say so explicitly via `./auth.ts`.
 *
 * Anything feature-specific belongs in the test that needs it, via
 * `server.use(...)`. Unhandled requests fail the test rather than hanging (see
 * `src/test/setup.ts`), so an "unexpected request" error means a handler is
 * missing, not that the component is broken.
 */
/**
 * `anAdmin()` carries the club's real ADMIN role, which grants MEMBER_ADMIN and
 * the flight-operations permissions but *not* STORE_ADMIN, EXAM_ADMIN,
 * DTO_ADMIN and the rest. The default identity needs all of them, or half the
 * pages in this app would render their 403 in tests that are not about
 * permissions at all.
 */
const A_SUPERUSER = anAdmin({ roles: [aRoleWithPermissions(...ALL_PERMISSIONS)] })

export const handlers = [
  // The 401 interceptor in useApi posts here before retrying. Signed-in by
  // default; `signInAs(null)` in src/test/auth.ts flips both this and /me.
  http.post(apiUrl('auth/refresh'), () => HttpResponse.json({})),
  http.get(apiUrl('v1/members/me'), () => HttpResponse.json(A_SUPERUSER)),
  http.get(apiUrl('v1/members/roles'), () => HttpResponse.json(aMemberRolesResponse())),
  http.get(apiUrl('v1/members'), () => HttpResponse.json(aMemberListResponse())),
]

/** RFC 9457 problem response with the minimal fields (`status`, `detail`) returned for error scenarios. */
export const problemResponse = (status: number, detail: string) =>
  HttpResponse.json({ status, detail }, { status })
