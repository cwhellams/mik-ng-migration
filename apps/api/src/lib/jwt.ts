/**
 * JWT signing and verification on `jose`, replacing `jsonwebtoken`.
 *
 * `jsonwebtoken` is Node-only — it reaches for `crypto.createHmac` and
 * `Buffer`. `jose` is the same thing over WebCrypto and runs on workerd
 * unchanged.
 *
 * **The tokens themselves are unchanged.** Same HS256, same `iss`/`aud`/`jti`
 * claims in the same shape, so a token minted by the Express backend verifies
 * here and a token minted here verifies there. That is not a nicety: during the
 * strangler migration both backends are live at once and a member's cookie is
 * presented to whichever one owns the path. The interop fixture in the test file
 * is a token signed by `jsonwebtoken`, and it is the actual guarantee.
 */

import { SignJWT, compactVerify, jwtVerify, type JWTPayload } from 'jose'

export const MIK_ISS = 'mik'
export const API_AUD = 'api'
export const REFRESH_AUD = 'refresh'

const secretKey = (secret: string): Uint8Array => new TextEncoder().encode(secret)

export interface SignOptions {
  issuer: string
  audience: string
  /** A duration `jose` understands: '15m', '7d', '100y'. */
  expiresIn: string
  jwtid?: string
}

export const signJwt = async (
  payload: JWTPayload,
  secret: string,
  options: SignOptions,
): Promise<string> => {
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setExpirationTime(options.expiresIn)

  if (options.jwtid) jwt.setJti(options.jwtid)

  return jwt.sign(secretKey(secret))
}

export const verifyJwt = async <T extends JWTPayload>(
  token: string,
  secret: string,
  options: { issuer: string; audience: string },
): Promise<T> => {
  const { payload } = await jwtVerify(token, secretKey(secret), options)
  return payload as T
}

/**
 * Verify a token's signature, issuer and audience but **not** its expiry.
 *
 * `/logout` is the only caller. The refresh cookie is scoped to path
 * `/api/auth/refresh` (see cookies.ts), so logout never receives it — the
 * access cookie is the only credential it gets, and a tab left open past the
 * 15-minute access-token life must still be able to end its session. The
 * signature check is what makes ignoring expiry safe.
 *
 * `jose` has no `ignoreExpiration`, deliberately, so this verifies the
 * signature with `compactVerify` and then checks `iss`/`aud` by hand rather
 * than reaching for a `currentDate` far enough in the past to disable the
 * check — that would silently disable `nbf` and `iat` validation too.
 */
export const verifyJwtIgnoringExpiry = async <T extends JWTPayload>(
  token: string,
  secret: string,
  options: { issuer: string; audience: string },
): Promise<T> => {
  const { payload: raw } = await compactVerify(token, secretKey(secret))
  const payload = JSON.parse(new TextDecoder().decode(raw)) as JWTPayload

  if (payload.iss !== options.issuer) throw new Error('unexpected "iss" claim value')
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audience.includes(options.audience)) throw new Error('unexpected "aud" claim value')

  return payload as T
}
