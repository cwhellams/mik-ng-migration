import { describe, expect, it } from 'vitest'

import { getContext, getEnv, runWithContext } from './context'
import type { Env } from './env'

const context = {
  env: { LEGACY_ORIGIN: 'https://legacy.example.test', NODE_ENV: 'test' } as Env,
  ctx: {} as ExecutionContext,
}

describe('request context', () => {
  it('throws outside a request rather than returning a default', () => {
    // A silent fallback for something request-scoped is far harder to diagnose
    // than a throw: the code carries on with plausible-looking wrong values.
    // The case this catches is a module-top-level read, which runs at isolate
    // start where there is no request at all.
    expect(() => getContext()).toThrow(/No request context/)
  })

  it('names the fix in the message, not just the fault', () => {
    expect(() => getEnv()).toThrow(/Move the read inside the handler/)
  })

  it('makes env reachable without being passed down', () => {
    // The whole point: 62 query modules and every service read configuration
    // from ambient state today via process.env, and threading `env` through
    // all of them would touch nearly every file in the backend.
    runWithContext(context, () => {
      expect(getEnv().LEGACY_ORIGIN).toBe('https://legacy.example.test')
    })
  })

  it('survives an await, which is what makes it usable at all', async () => {
    await runWithContext(context, async () => {
      await scheduler.wait(1)
      expect(getEnv().NODE_ENV).toBe('test')
    })
  })

  it('does not leak out of the request that set it', async () => {
    // Isolates are reused across requests on Workers, so a store that outlived
    // its request would hand one member's context to the next one.
    await runWithContext(context, async () => Promise.resolve())
    expect(() => getContext()).toThrow()
  })
})
