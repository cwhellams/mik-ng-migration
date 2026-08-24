import { http, HttpResponse } from 'msw'

/**
 * Default MSW handlers for the admin app test suite.
 *
 * Keep the list minimal — tests that need specific responses should use
 * `server.use(...)` to override for their own duration.
 */
export const handlers = [
  // Auth check — unauthenticated by default; individual tests override as needed.
  http.get('/api/v1/members/me', () => HttpResponse.json(null, { status: 401 })),
  http.get('/api/v1/members/roles', () => HttpResponse.json(null, { status: 401 })),
]
