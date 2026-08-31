import jwt, { type SignOptions } from 'jsonwebtoken'
import ms from 'ms'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import dayjs from 'dayjs'

import { MIKPermissions, type Member } from '@mik/contracts/members'
import { problem } from '../response.ts'
import { setAuthCookies } from './cookies.ts'

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

/**
 * The session-registry row this token belongs to (#1234).
 *
 * The *refresh* token carries it as the standard `jti` claim, because that token
 * is the thing a session is: exchanging it is the one moment revocation is
 * checked.
 *
 * The *access* token carries the same value as a separate `sid` claim, keeping
 * its own random `jti`. That is not redundancy. The refresh cookie is scoped to
 * path `/api/auth/refresh` (see cookies.ts), so it is never sent to
 * `/api/v1/members/.../sessions` -- the sessions endpoints cannot see it, and
 * without `sid` they would have no way to tell which of the listed rows is the
 * device asking. Nothing reads `sid` on the request hot path; authMiddleware
 * still does pure in-memory verification with no database lookup.
 */
export type SessionScopedJWTUser = JWTUser & { sid?: string }

/**
 * `sessionId` is optional on these two, and required on
 * respondWithAccessAndRefreshToken below. That is where the guarantee belongs:
 * every production path issues cookies through the response helper, so no real
 * login can forget to decide whether it is opening a session or continuing one.
 *
 * Leaving it optional here keeps a bare token mintable by the ~37 test files
 * that build one for supertest, and costs nothing in strictness — a token with
 * no session id is a state the system must cope with regardless, since every
 * refresh token issued before #1234 shipped is exactly that.
 */
export const generateAccessToken = (user: JWTUser, sessionId?: string): string => {
  return generateToken(
    sessionId ? { ...user, sid: sessionId } : user,
    process.env.ACCESS_TOKEN_SECRET,
    {
      jwtid: randomUUID(),
      expiresIn: process.env.ACCESS_TOKEN_EXPIRATION as ms.StringValue,
      issuer: MIK_ISS,
      audience: API_AUD,
    },
  )
}

export const generateRefreshToken = (user: JWTUser, sessionId?: string): string =>
  generateToken(user, process.env.REFRESH_TOKEN_SECRET, {
    ...(sessionId ? { jwtid: sessionId } : {}),
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue,
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  })

/**
 * Verified refresh-token payload plus its `jti`.
 *
 * `jti` is optional because a refresh token issued before #1234 shipped does not
 * have one. That is not an error case -- see the `/refresh` handler, which
 * adopts such a token into a fresh session rather than signing the member out.
 */
export type DecodedRefreshToken = JWTUser & { jti?: string }

/**
 * Verify an access token's signature but not its expiry, and hand back its
 * session id.
 *
 * `/logout` needs this because the refresh cookie is scoped to path
 * `/api/auth/refresh` (cookies.ts) and so is never sent to `/api/auth/logout` —
 * the access cookie, scoped to '/', is the only credential logout actually
 * receives. Expiry is ignored on purpose: a tab left open past the 15-minute
 * access-token life must still be able to end its session, and the signature
 * check is what makes that safe. Nothing but logout should ignore expiry.
 */
export const decodeAccessTokenIgnoringExpiry = (accessToken: string): SessionScopedJWTUser =>
  jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET!, {
    issuer: MIK_ISS,
    audience: API_AUD,
    ignoreExpiration: true,
  }) as SessionScopedJWTUser

export const decodeRefreshToken = (refreshToken: string): DecodedRefreshToken =>
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!, {
    issuer: MIK_ISS,
    audience: REFRESH_AUD,
  }) as DecodedRefreshToken

/**
 * Set httpOnly access + refresh cookies on the response and return a minimal
 * success body. Used by all login flows (magic-link, verify-code, passkey,
 * registration, token-refresh) so cookie flags/paths/names stay consistent.
 *
 * Cookie naming and scoping — including why the name carries the environment —
 * lives in ./cookies.ts.
 *
 * `sessionId` is required and has no default. Every caller has to decide whether
 * it is starting a session or continuing one, and the two answers are genuinely
 * different: a default would have made `/refresh` mint a new row every quarter
 * of an hour and turn the sessions list into a scroll of ghosts.
 */
export const respondWithAccessAndRefreshToken = (
  user: JWTUser,
  res: Response,
  sessionId: string,
): void => {
  setAuthCookies(res, {
    accessToken: generateAccessToken(user, sessionId),
    refreshToken: generateRefreshToken(user, sessionId),
    refreshExpires: dayjs()
      .add(ms(process.env.REFRESH_TOKEN_EXPIRATION as ms.StringValue), 'milliseconds')
      .toDate(),
  })
  res.json({ ok: true })
}
