import { AsyncLocalStorage } from 'node:async_hooks'

import type { Env } from './env'

/**
 * Per-request state that deep code needs but cannot be handed.
 *
 * Express let `apps/backend` reach `process.env` from anywhere; workerd does
 * not, and passing `env` down through 62 Kysely query modules and every service
 * would be a mechanical change to almost every file in the backend. An
 * AsyncLocalStorage store keeps the port to one line at the top of the request
 * and one call at each read site.
 *
 * This is also where the tenant will live once phase 7 lands: the tenant is
 * ambient to a request in exactly the same way, and the database handle is
 * derived from it.
 */
export interface RequestContext {
  env: Env
  /** For `waitUntil`, which is how a per-request resource gets closed. */
  ctx: ExecutionContext
}

const storage = new AsyncLocalStorage<RequestContext>()

export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn)

/**
 * Throws rather than returning a default when called outside a request.
 *
 * The same reasoning as `ApiConfigProvider` in @mik/ui: a silent fallback for
 * something request-scoped is far harder to diagnose than a throw, because the
 * code carries on with plausible-looking wrong values. Module top-level code is
 * the case that hits this — it runs at isolate start, where there is no request.
 */
export function getContext(): RequestContext {
  const context = storage.getStore()
  if (!context) {
    throw new Error(
      'No request context. getContext() is only valid inside a request — module ' +
        'top-level code runs at isolate start, where there is no env to read. Move ' +
        'the read inside the handler.',
    )
  }
  return context
}

export const getEnv = (): Env => getContext().env
