import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'

import { API_AUD, MIK_ISS, signJwt, verifyJwt, verifyJwtIgnoringExpiry } from './jwt'

const SECRET = 'test-access-secret'

/**
 * A token signed by **`jsonwebtoken`**, using the same options
 * `generateAccessToken` passes in apps/backend/src/routes/auth/token.ts. It
 * expires in 2126, so it does not rot.
 *
 * This is the point of the file. Both backends are live at once during the
 * strangler migration, and a member's cookie is presented to whichever one owns
 * the path — so a token minted by Express has to verify here. Regenerate with:
 *
 *   cd apps/backend && npx tsx --eval "import jwt from 'jsonwebtoken'; \
 *     console.log(jwt.sign(payload, '<secret>', { jwtid: '...', expiresIn: '100y', \
 *     issuer: 'mik', audience: 'api' }))"
 */
const JSONWEBTOKEN_FIXTURE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJtZW1iZXJJZCI6ImZpX3Rlc3QxIiwibGFzdE5hbWUiOiJXaGVsbGFtcyIs' +
  'ImVtYWlsIjoieEBleGFtcGxlLnRlc3QiLCJyb2xlcyI6WyJNRU1CRVIiXSwicGVybWlzc2lvbnMiOlsiTUVNQkVSX0FETUlOI' +
  'l0sImNhbk1ha2VSZXNlcnZhdGlvbnMiOnRydWUsInNpZCI6InNlc3MtMSIsImlhdCI6MTc4ODcwMzIyNSwiZXhwIjo0OTQ0ND' +
  'YzMjI1LCJhdWQiOiJhcGkiLCJpc3MiOiJtaWsiLCJqdGkiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDA' +
  'ifQ.FJ9NnUt9NcJ0BEaiO3hOsVFhbP-gh_EYDkhM4L7YFQQ'

const claims = { issuer: MIK_ISS, audience: API_AUD }

const expiredToken = () =>
  new SignJWT({ memberId: 'fi_test1' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(MIK_ISS)
    .setAudience(API_AUD)
    .setIssuedAt(1600000000)
    .setExpirationTime(1600000900)
    .sign(new TextEncoder().encode(SECRET))

describe('reading tokens the Express backend minted', () => {
  it('verifies a jsonwebtoken-signed access token and its claims', async () => {
    const payload = await verifyJwt<{ memberId: string; sid: string; jti: string }>(
      JSONWEBTOKEN_FIXTURE,
      SECRET,
      claims,
    )

    expect(payload.memberId).toBe('fi_test1')
    // sid is carried separately from jti on purpose (#1234): the refresh cookie
    // is path-scoped away from the sessions endpoints, so the access token is
    // the only thing that can say which listed session is this device.
    expect(payload.sid).toBe('sess-1')
    expect(payload.jti).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('rejects it under the wrong secret', async () => {
    await expect(verifyJwt(JSONWEBTOKEN_FIXTURE, 'not-the-secret', claims)).rejects.toThrow()
  })

  it('rejects it for the refresh audience', async () => {
    // The access and refresh tokens differ only by audience and secret, so this
    // is what stops one being replayed as the other.
    await expect(
      verifyJwt(JSONWEBTOKEN_FIXTURE, SECRET, { issuer: MIK_ISS, audience: 'refresh' }),
    ).rejects.toThrow()
  })

  it('rejects it under a different issuer', async () => {
    await expect(
      verifyJwt(JSONWEBTOKEN_FIXTURE, SECRET, { issuer: 'somebody-else', audience: API_AUD }),
    ).rejects.toThrow()
  })
})

describe('minting tokens', () => {
  it('round-trips a payload with its claims intact', async () => {
    const token = await signJwt({ memberId: 'fi_test1', sid: 'sess-1' }, SECRET, {
      ...claims,
      expiresIn: '15m',
      jwtid: 'abc',
    })

    const payload = await verifyJwt<{ memberId: string; jti: string }>(token, SECRET, claims)
    expect(payload.memberId).toBe('fi_test1')
    expect(payload.jti).toBe('abc')
  })

  it('omits jti when none is given', async () => {
    // The refresh token carries the session id *as* its jti, so a token issued
    // outside a session must not invent one.
    const token = await signJwt({ memberId: 'fi_test1' }, SECRET, { ...claims, expiresIn: '15m' })

    expect(await verifyJwt<{ jti?: string }>(token, SECRET, claims)).not.toHaveProperty('jti')
  })

  it('rejects an expired token', async () => {
    await expect(verifyJwt(await expiredToken(), SECRET, claims)).rejects.toThrow()
  })
})

describe('ignoring expiry, which only logout may do', () => {
  it('accepts an expired token', async () => {
    // A tab left open past the 15-minute access-token life must still be able
    // to end its session, and logout never receives the refresh cookie — it is
    // path-scoped to /api/auth/refresh.
    const payload = await verifyJwtIgnoringExpiry<{ memberId: string }>(
      await expiredToken(),
      SECRET,
      claims,
    )

    expect(payload.memberId).toBe('fi_test1')
  })

  it('still refuses a bad signature', async () => {
    // Ignoring expiry is only safe because the signature is still checked.
    await expect(
      verifyJwtIgnoringExpiry(await expiredToken(), 'not-the-secret', claims),
    ).rejects.toThrow()
  })

  it('still refuses the wrong audience and issuer', async () => {
    // jose has no ignoreExpiration, so these are checked by hand — which means
    // they are also the checks most easily forgotten.
    const token = await expiredToken()

    await expect(
      verifyJwtIgnoringExpiry(token, SECRET, { issuer: MIK_ISS, audience: 'refresh' }),
    ).rejects.toThrow('unexpected "aud" claim value')
    await expect(
      verifyJwtIgnoringExpiry(token, SECRET, { issuer: 'somebody-else', audience: API_AUD }),
    ).rejects.toThrow('unexpected "iss" claim value')
  })
})
