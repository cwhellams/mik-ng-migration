import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { Response } from 'express'

import {
  clearAuthCookies,
  respondWithAccessAndRefreshToken,
} from '../../../src/routes/auth/token.ts'
import type { JWTUser } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'

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

const user: JWTUser = {
  memberId: 'm-1',
  lastName: 'Tester',
  email: 'tester@mik.fi',
  roles: ['MEMBER'],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: true,
}

const envBefore = { ...process.env }

beforeEach(() => {
  process.env.ACCESS_TOKEN_SECRET = 'access-secret'
  process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
  process.env.ACCESS_TOKEN_EXPIRATION = '15m'
  process.env.REFRESH_TOKEN_EXPIRATION = '7d'
})

afterEach(() => {
  process.env = { ...envBefore }
})

/**
 * #1233's COOKIE_DOMAIN='.mik.fi' shares one session across intra/twr, but a
 * cookie's identity is (name, domain, path): the new '.mik.fi' cookie does not
 * replace the host-only one this backend set before, it sits beside it. The
 * browser sends both and cookie-parser keeps the first — the older, expired,
 * host-only one — so validateUser answered 401 forever and the member bounced
 * straight back to the login screen after every successful magic link.
 */
describe('respondWithAccessAndRefreshToken', () => {
  it('scopes both cookies to COOKIE_DOMAIN when it is set', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    const { res, set } = fakeRes()

    respondWithAccessAndRefreshToken(user, res)

    expect(set.map((c) => [c.name, c.options.domain, c.options.path])).toEqual([
      ['refreshToken', '.mik.fi', '/api/auth/refresh'],
      ['accessToken', '.mik.fi', '/'],
    ])
  })

  it('evicts the legacy host-only cookies that would otherwise shadow them', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    const { res, cleared } = fakeRes()

    respondWithAccessAndRefreshToken(user, res)

    // No domain on the clears: that is precisely the host-only pair.
    expect(cleared.map((c) => [c.name, c.options.domain, c.options.path])).toEqual([
      ['refreshToken', undefined, '/api/auth/refresh'],
      ['accessToken', undefined, '/'],
    ])
  })

  it('sets host-only cookies and clears nothing when COOKIE_DOMAIN is unset', () => {
    delete process.env.COOKIE_DOMAIN
    const { res, set, cleared } = fakeRes()

    respondWithAccessAndRefreshToken(user, res)

    expect(cleared).toHaveLength(0)
    expect(set.map((c) => [c.name, c.options.domain])).toEqual([
      ['refreshToken', undefined],
      ['accessToken', undefined],
    ])
  })
})

/**
 * Logout used to clear only the host-only variant, which left the shared
 * '.mik.fi' cookie alive — signing out of either app signed you out of neither.
 */
describe('clearAuthCookies', () => {
  it('clears both the host-only and the domain-scoped variants', () => {
    process.env.COOKIE_DOMAIN = '.mik.fi'
    const { res, cleared } = fakeRes()

    clearAuthCookies(res)

    expect(cleared.map((c) => [c.name, c.options.domain, c.options.path])).toEqual([
      ['refreshToken', undefined, '/api/auth/refresh'],
      ['accessToken', undefined, '/'],
      ['refreshToken', '.mik.fi', '/api/auth/refresh'],
      ['accessToken', '.mik.fi', '/'],
    ])
  })

  it('clears only the host-only variant when COOKIE_DOMAIN is unset', () => {
    delete process.env.COOKIE_DOMAIN
    const { res, cleared } = fakeRes()

    clearAuthCookies(res)

    expect(cleared.map((c) => [c.name, c.options.domain])).toEqual([
      ['refreshToken', undefined],
      ['accessToken', undefined],
    ])
  })
})
