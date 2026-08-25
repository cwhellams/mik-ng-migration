import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { Request, Response } from 'express'

import {
  AuthCookieConfigError,
  accessCookieName,
  assertAuthCookieConfig,
  clearAuthCookies,
  readAccessToken,
  readRefreshToken,
  refreshCookieName,
  setAuthCookies,
} from '../../../src/routes/auth/cookies.ts'

interface CookieCall {
  name: string
  value?: string
  options: { path?: string; domain?: string; sameSite?: string; httpOnly?: boolean }
}

/** Minimal Response stand-in that records every cookie/clearCookie call. */
const fakeRes = () => {
  const set: CookieCall[] = []
  const cleared: CookieCall[] = []
  const res = {
    cookie: (name: string, value: string, options: CookieCall['options']) => {
      set.push({ name, value, options })
      return res
    },
    clearCookie: (name: string, options: CookieCall['options']) => {
      cleared.push({ name, options })
      return res
    },
    json: () => res,
  }
  return { res: res as unknown as Response, set, cleared }
}

const tokens = {
  accessToken: 'access-jwt',
  refreshToken: 'refresh-jwt',
  refreshExpires: new Date('2027-01-01T00:00:00Z'),
}

/** (name, domain, path) — a cookie's actual identity. */
const triples = (calls: CookieCall[]) =>
  calls.map((c) => [c.name, c.options.domain, c.options.path])

const envBefore = { ...process.env }

beforeEach(() => {
  delete process.env.COOKIE_DOMAIN
  delete process.env.COOKIE_PREFIX
})

afterEach(() => {
  process.env = { ...envBefore }
})

describe('cookie names', () => {
  it('carries COOKIE_PREFIX so two deployments under one domain cannot collide', () => {
    process.env.COOKIE_PREFIX = 'intra_'
    expect(accessCookieName()).toBe('intra_accessToken')
    expect(refreshCookieName()).toBe('intra_refreshToken')
  })

  it('falls back to the unprefixed names when COOKIE_PREFIX is unset', () => {
    expect(accessCookieName()).toBe('accessToken')
    expect(refreshCookieName()).toBe('refreshToken')
  })

  it('reads the token under the prefixed name only', () => {
    process.env.COOKIE_PREFIX = 'beta_'
    const req = {
      cookies: { accessToken: 'stale-prod', beta_accessToken: 'mine', refreshToken: 'stale' },
    } as unknown as Request

    // The unprefixed cookie is production's. Reading it here is exactly the bug.
    expect(readAccessToken(req)).toBe('mine')
    expect(readRefreshToken(req)).toBeUndefined()
  })
})

/**
 * intra.mik.fi/twr.mik.fi and beta.mik.fi/beta-twr.mik.fi share only 'mik.fi' as
 * a suffix, so COOKIE_DOMAIN alone cannot separate the environments: both wrote
 * ('accessToken', '.mik.fi', '/') — one cookie, last writer wins. Signing into
 * beta handed production a token signed with a secret it does not hold, and
 * production 401'd every request until the member signed in again, which broke
 * beta in turn. Booting without a prefix is what allows that, so we refuse to.
 */
describe('assertAuthCookieConfig', () => {
  it('throws when COOKIE_DOMAIN is shared but no COOKIE_PREFIX separates it', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    expect(() => assertAuthCookieConfig()).toThrow(AuthCookieConfigError)
    expect(() => assertAuthCookieConfig()).toThrow(/COOKIE_PREFIX/)
  })

  it('accepts a shared COOKIE_DOMAIN once the name distinguishes the environment', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    expect(() => assertAuthCookieConfig()).not.toThrow()
  })

  it('accepts host-only cookies with no prefix — nothing is shared to collide', () => {
    expect(() => assertAuthCookieConfig()).not.toThrow()
  })
})

describe('setAuthCookies', () => {
  it('scopes both cookies to COOKIE_DOMAIN under the prefixed name', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    const { res, set } = fakeRes()

    setAuthCookies(res, tokens)

    expect(triples(set)).toEqual([
      ['intra_refreshToken', '.mik.fi', '/api/auth/refresh'],
      ['intra_accessToken', '.mik.fi', '/'],
    ])
    expect(set.map((c) => c.value)).toEqual(['refresh-jwt', 'access-jwt'])
  })

  /**
   * Two cookies of the same name are ordered by path length then creation time
   * (RFC 6265 §5.4) and `cookie-parser` keeps the first — so an older host-only
   * leftover wins every read no matter how many times the member signs in.
   */
  it('evicts every other variant, including the legacy unprefixed names', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    const { res, cleared } = fakeRes()

    setAuthCookies(res, tokens)

    expect(triples(cleared)).toEqual([
      ['intra_accessToken', undefined, '/'],
      ['intra_refreshToken', undefined, '/api/auth/refresh'],
      ['accessToken', undefined, '/'],
      ['accessToken', '.mik.fi', '/'],
      ['refreshToken', undefined, '/api/auth/refresh'],
      ['refreshToken', '.mik.fi', '/api/auth/refresh'],
    ])
  })

  it('never clears a cookie it is about to set', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    const { res, set, cleared } = fakeRes()

    setAuthCookies(res, tokens)

    for (const s of triples(set)) {
      expect(triples(cleared)).not.toContainEqual(s)
    }
  })

  it('sets host-only cookies and clears only leftovers when COOKIE_DOMAIN is unset', () => {
    const { res, set, cleared } = fakeRes()

    setAuthCookies(res, tokens)

    expect(triples(set)).toEqual([
      ['refreshToken', undefined, '/api/auth/refresh'],
      ['accessToken', undefined, '/'],
    ])
    // Legacy names equal current names here, so there is nothing left to evict.
    expect(cleared).toHaveLength(0)
  })
})

/**
 * Logout used to clear only the host-only variant, which left the shared
 * '.mik.fi' cookie alive — signing out of either app signed you out of neither.
 */
describe('clearAuthCookies', () => {
  it('clears current and legacy names in both host-only and domain scopes', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    const { res, cleared } = fakeRes()

    clearAuthCookies(res)

    expect(triples(cleared)).toEqual([
      ['intra_accessToken', undefined, '/'],
      ['intra_accessToken', '.mik.fi', '/'],
      ['intra_refreshToken', undefined, '/api/auth/refresh'],
      ['intra_refreshToken', '.mik.fi', '/api/auth/refresh'],
      ['accessToken', undefined, '/'],
      ['accessToken', '.mik.fi', '/'],
      ['refreshToken', undefined, '/api/auth/refresh'],
      ['refreshToken', '.mik.fi', '/api/auth/refresh'],
    ])
  })

  it('clears one variant of each name when COOKIE_DOMAIN is unset', () => {
    const { res, cleared } = fakeRes()

    clearAuthCookies(res)

    expect(triples(cleared)).toEqual([
      ['accessToken', undefined, '/'],
      ['refreshToken', undefined, '/api/auth/refresh'],
    ])
  })

  it('marks every cleared cookie httpOnly and SameSite=Strict', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    process.env.COOKIE_PREFIX = 'intra_'
    const { res, cleared } = fakeRes()

    clearAuthCookies(res)

    for (const c of cleared) {
      expect(c.options.httpOnly).toBe(true)
      expect(c.options.sameSite).toBe('strict')
    }
  })
})
