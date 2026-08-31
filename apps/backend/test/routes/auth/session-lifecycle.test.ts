import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'

/**
 * How a session registry row is opened, kept alive and closed (#1234), across
 * the three auth endpoints that own its lifecycle.
 *
 * The interesting cases are all about /refresh, because that is the only place
 * revocation is ever noticed: it must reuse the session rather than opening a
 * new one every quarter of an hour, must refuse a revoked one, and must not sign
 * out the whole club the moment it is deployed against tokens that predate it.
 */

const mockGetMemberByEmail = jest.fn<(email: string) => Promise<any>>()
const mockGetMemberById = jest.fn<(id: string) => Promise<any>>()
const mockCreateSession = jest.fn<(...a: any[]) => Promise<string>>()
const mockTouchSession = jest.fn<(id: string) => Promise<boolean>>()
const mockRevokeSession = jest.fn<(...a: any[]) => Promise<boolean>>()
const mockCreateLoginEvent = jest.fn<(...a: any[]) => Promise<void>>()
const mockClaimLoginAttemptByTokenHash = jest.fn<(...a: any[]) => Promise<any>>()

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  addMember: jest.fn(),
  getMemberByEmail: mockGetMemberByEmail,
  getMemberById: mockGetMemberById,
  updateMember: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/session-queries.ts', () => ({
  createSession: mockCreateSession,
  touchSession: mockTouchSession,
  revokeSession: mockRevokeSession,
  getActiveSessionsForMember: jest.fn(),
  getSessionById: jest.fn(),
  revokeOtherSessions: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/auth-queries.ts', () => ({
  claimLoginAttemptByTokenHash: mockClaimLoginAttemptByTokenHash,
  createLoginAttempt: jest.fn(),
  createLoginEvent: mockCreateLoginEvent,
  getActiveLoginAttempt: jest.fn(),
  incrementLoginAttemptFailures: jest.fn(),
  invalidatePreviousLoginAttempts: jest.fn(),
  markLoginAttemptUsed: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/invoicing-queries.ts', () => ({
  getArticleFees: jest.fn<(codes: string[]) => Promise<unknown[]>>().mockResolvedValue([]),
}))

const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()

jest.unstable_mockModule('../../../src/lib/logger.ts', () => ({
  default: { error: mockLoggerError, warn: mockLoggerWarn, info: jest.fn(), debug: jest.fn() },
}))

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({ sendEmail: jest.fn() }))
jest.unstable_mockModule('../../../src/services/turnstile.ts', () => ({
  verifyTurnstileToken: jest.fn(),
}))
jest.unstable_mockModule('../../../src/templates/renderEmail.ts', () => ({
  renderEmail: jest.fn(() => ({ subject: 's', html: '<html></html>' })),
}))
jest.unstable_mockModule('../../../src/routes/auth/registration-verification.ts', () => ({
  MIKRegistrationVerificationStrategy: jest.fn().mockImplementation(() => ({
    generateVerificationLink: jest.fn(),
    verifyRegistration: jest.fn(),
  })),
}))

process.env.ACCESS_TOKEN_SECRET = 'access-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
process.env.ACCESS_TOKEN_EXPIRATION = '15m'
process.env.REFRESH_TOKEN_EXPIRATION = '365d'
process.env.PUBLIC_URL = 'https://intra.test.example.com'
process.env.MAGIC_LINK_SECRET = 'magic-link-secret'
delete process.env.COOKIE_PREFIX
delete process.env.COOKIE_DOMAIN

const { router } = await import('../../../src/routes/auth/login.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { generateAccessToken, generateRefreshToken, decodeRefreshToken } =
  await import('../../../src/routes/auth/token.ts')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/api/auth', router)
app.use(problemErrorHandler)

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const NEW_SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const member = {
  memberId: 'Matti1',
  lastName: 'Meikalainen',
  email: 'matti@mik.fi',
  firstName: 'Matti',
  lang: 'fi',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  canMakeReservations: true,
  roles: [],
}

const jwtUser = {
  memberId: member.memberId,
  lastName: member.lastName,
  email: member.email,
  roles: [],
  permissions: [],
  canMakeReservations: true,
}

/** The cookie header a browser would send to /api/auth/refresh. */
const refreshCookie = (sessionId?: string) =>
  `refreshToken=${generateRefreshToken(jwtUser, sessionId)}`

/** The cookie header a browser sends everywhere else, including /logout. */
const accessCookie = (sessionId?: string) =>
  `accessToken=${generateAccessToken(jwtUser, sessionId)}`

const setCookies = (res: request.Response) => res.headers['set-cookie'] as unknown as string[]

const reissuedRefreshToken = (res: request.Response) =>
  setCookies(res)
    .find((c) => c.startsWith('refreshToken='))!
    .split(';')[0]
    .slice('refreshToken='.length)

describe('Session lifecycle across the auth routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateSession.mockResolvedValue(NEW_SESSION_ID)
    mockTouchSession.mockResolvedValue(true)
    mockRevokeSession.mockResolvedValue(true)
    mockCreateLoginEvent.mockResolvedValue()
    mockGetMemberById.mockResolvedValue(member)
    mockGetMemberByEmail.mockResolvedValue(member)
  })

  describe('POST /login/validate — magic link', () => {
    it('opens a session and puts its id in the refresh token', async () => {
      mockClaimLoginAttemptByTokenHash.mockResolvedValue({ id: 'attempt1', email: member.email })

      const res = await request(app)
        .post('/api/auth/login/validate')
        .set('user-agent', 'jest-agent')
        .send({ token: 'raw-magic-token' })

      expect(res.status).toBe(200)
      expect(mockCreateSession).toHaveBeenCalledWith('Matti1', expect.any(String), 'jest-agent')
      expect(decodeRefreshToken(reissuedRefreshToken(res)).jti).toBe(NEW_SESSION_ID)
    })
  })

  describe('POST /refresh', () => {
    it('reuses the session in the incoming token rather than opening a second one', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(SESSION_ID))

      expect(res.status).toBe(200)
      expect(mockTouchSession).toHaveBeenCalledWith(SESSION_ID)
      expect(mockCreateSession).not.toHaveBeenCalled()
    })

    it('keeps the same session id across two sequential refreshes', async () => {
      const first = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(SESSION_ID))

      const second = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${reissuedRefreshToken(first)}`)

      expect(second.status).toBe(200)
      expect(decodeRefreshToken(reissuedRefreshToken(second)).jti).toBe(SESSION_ID)
      expect(mockCreateSession).not.toHaveBeenCalled()
    })

    it('answers 401 and clears the cookies when the session has been terminated', async () => {
      mockTouchSession.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie(SESSION_ID))

      expect(res.status).toBe(401)
      // Not a new session: minting one here would undo the terminate the member
      // just performed from their other device.
      expect(mockCreateSession).not.toHaveBeenCalled()
      const cookies = setCookies(res).join(';')
      expect(cookies).toMatch(/accessToken=;/)
      expect(cookies).toMatch(/refreshToken=;/)
    })

    it('adopts a refresh token that predates session ids instead of signing the member out', async () => {
      // Every token issued before this feature shipped has no jti. Treating that
      // as "revoked" would log out every member at deploy time.
      const res = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie())

      expect(res.status).toBe(200)
      expect(mockTouchSession).not.toHaveBeenCalled()
      expect(mockCreateSession).toHaveBeenCalledWith('Matti1', expect.any(String), undefined)
      expect(decodeRefreshToken(reissuedRefreshToken(res)).jti).toBe(NEW_SESSION_ID)
    })

    it('still answers 401 for a token it cannot verify at all', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refreshToken=not-a-jwt')

      expect(res.status).toBe(401)
      expect(mockTouchSession).not.toHaveBeenCalled()
      expect(mockCreateSession).not.toHaveBeenCalled()
    })
  })

  describe('POST /logout', () => {
    it('revokes the session named by the access cookie and writes the logout event', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('user-agent', 'jest-agent')
        .set('Cookie', accessCookie(SESSION_ID))

      expect(res.status).toBe(200)
      expect(mockRevokeSession).toHaveBeenCalledWith(SESSION_ID, 'logout')
      // 'logout' has been in the auth_event_type enum from the start and was
      // never once written before this.
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'Matti1',
        'logout',
        expect.any(String),
        'jest-agent',
      )
    })

    it('reads the access cookie, not the refresh one, which is not sent to this path', async () => {
      // The refresh cookie's Path is /api/auth/refresh, so a real browser never
      // sends it here. Supplying only that must therefore revoke nothing.
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', refreshCookie(SESSION_ID))

      expect(res.status).toBe(200)
      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it('clears cookies and answers 200 with no cookie at all', async () => {
      const res = await request(app).post('/api/auth/logout')

      expect(res.status).toBe(200)
      expect(mockRevokeSession).not.toHaveBeenCalled()
      expect(mockCreateLoginEvent).not.toHaveBeenCalled()
      expect(setCookies(res).join(';')).toMatch(/accessToken=;/)
    })

    it('clears cookies and answers 200 when the access cookie is garbage', async () => {
      // A member who cannot sign out is worse than an unrecorded logout event.
      const res = await request(app).post('/api/auth/logout').set('Cookie', 'accessToken=not-a-jwt')

      expect(res.status).toBe(200)
      expect(mockRevokeSession).not.toHaveBeenCalled()
      expect(setCookies(res).join(';')).toMatch(/refreshToken=;/)
    })

    it('still ends the session for a tab whose access token has already expired', async () => {
      // decodeAccessTokenIgnoringExpiry exists for exactly this: someone who
      // left a tab open for more than 15 minutes and then clicked Log out. Only
      // the signature has to hold, and it does.
      const previous = process.env.ACCESS_TOKEN_EXPIRATION
      process.env.ACCESS_TOKEN_EXPIRATION = '-1s'
      const expired = accessCookie(SESSION_ID)
      process.env.ACCESS_TOKEN_EXPIRATION = previous

      const res = await request(app).post('/api/auth/logout').set('Cookie', expired)

      expect(res.status).toBe(200)
      expect(mockRevokeSession).toHaveBeenCalledWith(SESSION_ID, 'logout')
    })

    it('reports a failing revoke as an error rather than an unreadable token', async () => {
      // The decode succeeded; the database did not. One bare catch around both
      // logged this under 'unreadable access token', which reads as working as
      // designed and hides a session that is still live.
      mockRevokeSession.mockRejectedValue(new Error('connection terminated'))

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', accessCookie(SESSION_ID))

      // The member still gets signed out of this browser: the cookies go either way.
      expect(res.status).toBe(200)
      expect(setCookies(res).join(';')).toMatch(/accessToken=;/)
      expect(mockLoggerWarn).not.toHaveBeenCalledWith(
        expect.stringContaining('unreadable access token'),
      )
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('failed to revoke session'),
        SESSION_ID,
        expect.any(Error),
      )
    })

    it('clears cookies but revokes nothing for a token that predates session ids', async () => {
      const res = await request(app).post('/api/auth/logout').set('Cookie', accessCookie())

      expect(res.status).toBe(200)
      expect(mockRevokeSession).not.toHaveBeenCalled()
      // The audit event is still written — the member did log out.
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'Matti1',
        'logout',
        expect.any(String),
        undefined,
      )
    })
  })
})
