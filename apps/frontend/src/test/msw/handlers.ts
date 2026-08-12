import type { AppConfig } from '@mik/contracts/config'
import type { NotificationBanner } from '@mik/contracts/notification-banner'
import type { TimeResponse } from '@mik/contracts/time'
import { http, HttpResponse } from 'msw'

import {
  aBookingListResponse,
  aFlightLogListResponse,
  aMember,
  aMemberListResponse,
  aMemberRolesResponse,
  anAircraftListResponse,
  FIXTURE_TIMESTAMP,
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
 * These cover the endpoints that the app shell hits on essentially every
 * render — who am I, what can I do, what time is it. Anything feature-specific
 * belongs in the test that needs it, via `server.use(...)`:
 *
 * ```ts
 * server.use(http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json({ aircrafts: [] })))
 * ```
 *
 * Unhandled requests fail the test rather than hanging (see `src/test/setup.ts`),
 * so an "unexpected request" error means a handler is missing, not that the
 * component is broken.
 */
export const handlers = [
  // --- auth / identity -----------------------------------------------------
  // The 401 interceptor in useApi posts here before retrying. Signed-in by
  // default; `signInAs(null)` in src/test/auth.ts flips both this and /me.
  http.post(apiUrl('auth/refresh'), () => HttpResponse.json({})),
  http.get(apiUrl('v1/members/me'), () => HttpResponse.json(aMember())),
  http.get(apiUrl('v1/members/roles'), () => HttpResponse.json(aMemberRolesResponse())),

  // --- app shell -----------------------------------------------------------
  http.get(apiUrl('v1/config'), () => HttpResponse.json<AppConfig>({ medicalCheckEnabled: false })),
  http.get(apiUrl('v1/version'), () => HttpResponse.json({ version: '0.0.0-test' })),
  http.get(apiUrl('v1/time'), () =>
    HttpResponse.json<TimeResponse>({
      utcIso: FIXTURE_TIMESTAMP,
      epochMs: Date.parse(FIXTURE_TIMESTAMP),
    }),
  ),
  http.get(apiUrl('v1/notification-banner'), () =>
    HttpResponse.json<NotificationBanner>({ enabled: false, message: null, severity: 'info' }),
  ),
  http.get(apiUrl('v1/mailbox/unread-count'), () => HttpResponse.json({ count: 0 })),

  // --- core collections ----------------------------------------------------
  http.get(apiUrl('v1/members'), () => HttpResponse.json(aMemberListResponse())),
  http.get(apiUrl('v1/aircrafts'), () => HttpResponse.json(anAircraftListResponse())),
  http.get(apiUrl('v1/bookings'), () => HttpResponse.json(aBookingListResponse())),
  http.get(apiUrl('v1/flight-logs'), () => HttpResponse.json(aFlightLogListResponse())),
]

/** RFC 9457 problem response with the minimal fields (`status`, `detail`) returned for error scenarios. */
export const problemResponse = (status: number, detail: string) =>
  HttpResponse.json({ status, detail }, { status })
