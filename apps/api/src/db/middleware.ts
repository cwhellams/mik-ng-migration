import type { MiddlewareHandler } from 'hono'

import { closeDbSession, openDbSession } from './session'

/**
 * Opens a database session for the request and commits it, or rolls it back if
 * the handler threw.
 *
 * Applied per route group rather than globally, because a request that never
 * touches the database should not pay a connection and a `begin`/`commit` for
 * the privilege — `/api/v1/time` is the case in front of us today.
 *
 * Rollback is on a **thrown** error, not on a 4xx/5xx response, which keeps the
 * Express behaviour: `problem()` throws, so a problem response rolls back, while
 * a handler that deliberately returns an error status after writing still
 * commits.
 */
export const database: MiddlewareHandler = async (_c, next) => {
  const session = await openDbSession()
  try {
    await next()
  } catch (error) {
    await closeDbSession(session, false)
    throw error
  }
  await closeDbSession(session, true)
}
