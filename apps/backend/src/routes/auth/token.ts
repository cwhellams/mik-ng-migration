import jwt, { type SignOptions } from 'jsonwebtoken'
import ms from 'ms'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import dayjs from 'dayjs'

import { MIKPermissions, type Member } from '@mik/contracts/members'
import { problem } from '../response.ts'

export const MIK_ISS = 'mik'
export const API_AUD = 'api'
export const REFRESH_AUD = 'refresh'

// should match User in types/express.d.ts
export const JWTUserSchema = z.object({
  memberId: z.string(),
  lastName: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.nativeEnum(MIKPermissions)),
  canMakeReservations: z.boolean(),
})

export type JWTUser = z.infer<typeof JWTUserSchema>

export const generateJWTUser = (user: Member): JWTUser => ({
  memberId: user.memberId,
  lastName: user.lastName,
  email: user.email,
  roles: user.roles.map((r) => r.roleId),
  permissions: user.roles.reduce(
    (all, role) => (role.permissions ? [...all, ...role.permissions] : all),
    [] as MIKPermissions[],
  ),
  canMakeReservations: user.canMakeReservations,
})

export const generateToken = (
  payload: object,
  secret: string | undefined,
  options: SignOptions,
): string => {
  return jwt.sign(payload, secret ?? problem({ status: 500, detail: 'No secret' }), options)
}

export const generateAccessToken = (user: JWTUser): string => {
  return generateToken(user, process.env.ACCESS_TOKEN_SECRET, {
    jwtid: randomUUID(),
    expiresIn: process.env.ACCESS_TOKEN_EXPIRATION as ms.StringValue,
    issuer: MIK_ISS,
    audience: API_AUD,
  })
}

export const generateRefreshToken = (user: JWTUser): string =>
  generateToken(user, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue,
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  })

export const decodeRefreshToken = (refreshToken: string): JWTUser =>
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!, {
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  }) as JWTUser

const REFRESH_COOKIE_PATH = '/api/auth/refresh'
const ACCESS_COOKIE_PATH = '/'

// Read at call time, not module load: tests flip NODE_ENV/COOKIE_DOMAIN per case.
const baseCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
})

/**
 * When COOKIE_DOMAIN is set (e.g. '.mik.fi'), cookies are shared across all
 * subdomains so both intra.mik.fi and twr.mik.fi (admin) use one auth session.
 */
const cookieDomain = (): string | undefined => process.env.COOKIE_DOMAIN || undefined

/**
 * Delete both variants of the auth cookies: the domain-scoped ones we set now,
 * and the host-only ones this backend set before COOKIE_DOMAIN existed.
 *
 * A cookie's identity is (name, domain, path), so those two are *different*
 * cookies that the browser happily stores side by side and sends together on
 * every request. `cookie-parser` then keeps whichever came first in the header
 * — by RFC 6265 the older one, i.e. the stale host-only leftover — so
 * `req.cookies.accessToken` is an expired token and `validateUser` answers 401
 * no matter how many times the member signs in. That is the login loop.
 */
export const clearAuthCookies = (res: Response): void => {
  const domain = cookieDomain()
  for (const scope of domain ? [{}, { domain }] : [{}]) {
    res.clearCookie('refreshToken', {
      ...baseCookieOptions(),
      path: REFRESH_COOKIE_PATH,
      ...scope,
    })
    res.clearCookie('accessToken', { ...baseCookieOptions(), path: ACCESS_COOKIE_PATH, ...scope })
  }
}

/**
 * Set httpOnly access + refresh cookies on the response and return a minimal
 * success body. Used by all login flows (magic-link, verify-code, passkey,
 * registration, token-refresh) so cookie flags/paths stay consistent.
 */
export const respondWithAccessAndRefreshToken = (user: JWTUser, res: Response): void => {
  const domain = cookieDomain()

  // Evict any host-only leftovers first — see clearAuthCookies. Without this a
  // member who last signed in before COOKIE_DOMAIN was deployed can never sign
  // in again: the new cookie is set correctly and then shadowed on every read.
  if (domain) {
    res.clearCookie('refreshToken', { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH })
    res.clearCookie('accessToken', { ...baseCookieOptions(), path: ACCESS_COOKIE_PATH })
  }

  res.cookie('refreshToken', generateRefreshToken(user), {
    ...baseCookieOptions(),
    expires: dayjs()
      .add(ms(process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue), 'milliseconds')
      .toDate(),
    path: REFRESH_COOKIE_PATH,
    ...(domain ? { domain } : {}),
  })
  res.cookie('accessToken', generateAccessToken(user), {
    ...baseCookieOptions(),
    path: ACCESS_COOKIE_PATH,
    ...(domain ? { domain } : {}),
  })
  res.json({ ok: true })
}
