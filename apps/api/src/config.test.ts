import { describe, expect, it } from 'vitest'

import { isPorted, portedPrefixes } from './config'
import { runWithContext } from './context'
import type { Env } from './env'

const withEnv = <T>(env: Partial<Env>, fn: () => T): T =>
  runWithContext(
    {
      env: { LEGACY_ORIGIN: 'https://legacy.example.test', ...env } as Env,
      ctx: {} as ExecutionContext,
    },
    fn,
  )

describe('ported prefixes', () => {
  it('claims a ported domain and its sub-paths', () => {
    withEnv({}, () => {
      expect(isPorted('/api/v1/time')).toBe(true)
      expect(isPorted('/api/v1/time/zones')).toBe(true)
    })
  })

  it('leaves everything else to the legacy backend', () => {
    withEnv({}, () => {
      expect(isPorted('/api/v1/members')).toBe(false)
      expect(isPorted('/t/2cQ3')).toBe(false)
      expect(isPorted('/health')).toBe(false)
    })
  })

  it('does not claim a prefix match on a longer segment', () => {
    // /api/v1/timesheets is a plausible future domain, and proxying it to a
    // Worker that has no route for it would 404 a working endpoint.
    withEnv({}, () => expect(isPorted('/api/v1/timesheets')).toBe(false))
  })

  it('lets the environment replace the compiled-in list', () => {
    withEnv({ PORTED_PREFIXES: '/api/v1/members, /api/v1/time' }, () => {
      expect(portedPrefixes()).toEqual(['/api/v1/members', '/api/v1/time'])
      expect(isPorted('/api/v1/members')).toBe(true)
    })
  })

  it('sends everything back to the legacy backend when set empty', () => {
    // The rollback lever. An empty string has to mean "nothing is ported",
    // not "fall back to the defaults" - otherwise the lever does nothing in
    // precisely the situation it exists for.
    withEnv({ PORTED_PREFIXES: '' }, () => {
      expect(portedPrefixes()).toEqual([])
      expect(isPorted('/api/v1/time')).toBe(false)
    })
  })
})
