import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// --- Module mocks (must be set up BEFORE importing the route) -----------------

const mockGetActiveSessionsForMember = jest.fn<(memberId: string) => Promise<any[]>>()
const mockGetSessionById = jest.fn<(id: string) => Promise<any>>()
const mockRevokeSession = jest.fn<(...a: any[]) => Promise<boolean>>()
const mockRevokeOtherSessions = jest.fn<(...a: any[]) => Promise<number>>()
const mockCreateLoginEvent = jest.fn<(...a: any[]) => Promise<void>>()

jest.unstable_mockModule('../../../src/db/session-queries.ts', () => ({
  getActiveSessionsForMember: mockGetActiveSessionsForMember,
  getSessionById: mockGetSessionById,
  revokeSession: mockRevokeSession,
  revokeOtherSessions: mockRevokeOtherSessions,
  createSession: jest.fn(),
  touchSession: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/auth-queries.ts', () => ({
  createLoginEvent: mockCreateLoginEvent,
}))

const { MIKPermissions } = await import('@mik/contracts/members')

const OWN_SESSION = '11111111-1111-1111-1111-111111111111'
const OTHER_SESSION = '22222222-2222-2222-2222-222222222222'
const STRANGERS_SESSION = '33333333-3333-3333-3333-333333333333'

/**
 * The backend's usual identity triad, plus the axis that only matters here:
 * whether the caller's access token carries a session id at all. A token minted
 * before #1234 does not, which is a real state for the first quarter of an hour
 * after a deploy.
 */
const identities = {
  admin: {
    memberId: 'k1mnimda',
    lastName: 'Admin',
    email: 'admin@mik.fi',
    roles: [],
    permissions: [MIKPermissions.MEMBER_ADMIN],
    canMakeReservations: false,
    sid: OWN_SESSION,
  },
  member: {
    memberId: 'Matti1',
    lastName: 'Meikalainen',
    email: 'matti@mik.fi',
    roles: [],
    permissions: [MIKPermissions.BOOKING_USER],
    canMakeReservations: true,
    sid: OWN_SESSION,
  },
  noPermissions: {
    memberId: 'Liisa1',
    lastName: 'Virtanen',
    email: 'liisa@mik.fi',
    roles: [],
    permissions: [],
    canMakeReservations: false,
    sid: OWN_SESSION,
  },
}

let mockUser: any = identities.member

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = mockUser
      next()
    },
}))

process.env.ACCESS_TOKEN_SECRET = 'access-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
process.env.ACCESS_TOKEN_EXPIRATION = '15m'
process.env.REFRESH_TOKEN_EXPIRATION = '365d'

const { memberSessionsRouter } = await import('../../../src/routes/auth/session.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/members/me/sessions', memberSessionsRouter)
app.use('/api/v1/members/:memberId/sessions', memberSessionsRouter)
app.use(problemErrorHandler)

const aRow = (overrides: Record<string, unknown> = {}) => ({
  id: OTHER_SESSION,
  memberId: 'Matti1',
  ipAddress: '192.0.2.1',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  createdAt: '2026-08-01T10:00:00.000Z',
  lastUsedAt: '2026-08-02T10:00:00.000Z',
  ...overrides,
})

describe('Member session routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUser = identities.member
    mockGetActiveSessionsForMember.mockResolvedValue([])
    mockRevokeSession.mockResolvedValue(true)
    mockRevokeOtherSessions.mockResolvedValue(0)
    mockCreateLoginEvent.mockResolvedValue()
  })

  describe('GET /me/sessions', () => {
    it('lists the caller own sessions with a friendly device label', async () => {
      mockGetActiveSessionsForMember.mockResolvedValue([aRow()])

      const res = await request(app).get('/api/v1/members/me/sessions')

      expect(res.status).toBe(200)
      expect(mockGetActiveSessionsForMember).toHaveBeenCalledWith('Matti1')
      expect(res.body.sessions).toHaveLength(1)
      expect(res.body.sessions[0]).toMatchObject({
        id: OTHER_SESSION,
        ipAddress: '192.0.2.1',
        device: 'Chrome on Windows',
        isCurrent: false,
      })
    })

    it('marks the row matching the caller own token as the current session', async () => {
      mockGetActiveSessionsForMember.mockResolvedValue([
        aRow({ id: OWN_SESSION }),
        aRow({ id: OTHER_SESSION }),
      ])

      const res = await request(app).get('/api/v1/members/me/sessions')

      expect(res.body.sessions.map((s: any) => [s.id, s.isCurrent])).toEqual([
        [OWN_SESSION, true],
        [OTHER_SESSION, false],
      ])
    })

    it('labels a session with no user agent rather than leaving it blank', async () => {
      mockGetActiveSessionsForMember.mockResolvedValue([aRow({ userAgent: null })])

      const res = await request(app).get('/api/v1/members/me/sessions')

      expect(res.body.sessions[0].device).toBe('Unknown device')
      expect(res.body.sessions[0].userAgent).toBeNull()
    })

    it('marks nothing as current when the caller token predates session ids', async () => {
      mockUser = { ...identities.member, sid: undefined }
      mockGetActiveSessionsForMember.mockResolvedValue([aRow({ id: OWN_SESSION })])

      const res = await request(app).get('/api/v1/members/me/sessions')

      expect(res.body.sessions[0].isCurrent).toBe(false)
    })

    it.each([
      ['admin', identities.admin],
      ['ordinary member', identities.member],
      ['member without permissions', identities.noPermissions],
    ])('lets %s read their own sessions', async (_name, identity) => {
      mockUser = identity
      mockGetActiveSessionsForMember.mockResolvedValue([])

      const res = await request(app).get('/api/v1/members/me/sessions')

      expect(res.status).toBe(200)
      expect(mockGetActiveSessionsForMember).toHaveBeenCalledWith(identity.memberId)
    })
  })

  describe("GET /:memberId/sessions — somebody else's", () => {
    it('lets a MEMBER_ADMIN read them', async () => {
      mockUser = identities.admin

      const res = await request(app).get('/api/v1/members/Matti1/sessions')

      expect(res.status).toBe(200)
      expect(mockGetActiveSessionsForMember).toHaveBeenCalledWith('Matti1')
    })

    it.each([
      ['ordinary member', identities.member],
      ['member without permissions', identities.noPermissions],
    ])('refuses %s', async (_name, identity) => {
      mockUser = identity

      const res = await request(app).get('/api/v1/members/Pekka1/sessions')

      expect(res.status).toBe(403)
      expect(mockGetActiveSessionsForMember).not.toHaveBeenCalled()
    })

    it('treats a member asking about their own id as a self request', async () => {
      mockUser = identities.member

      const res = await request(app).get('/api/v1/members/Matti1/sessions')

      expect(res.status).toBe(200)
    })

    it('never marks an admin own session id as current on somebody else list', async () => {
      mockUser = identities.admin
      // Contrived, but the point is that the comparison is against the requester
      // token and the row's owner is irrelevant to it: were it compared against
      // the target, an admin could be told a member's session is "this device".
      mockGetActiveSessionsForMember.mockResolvedValue([aRow({ id: OTHER_SESSION })])

      const res = await request(app).get('/api/v1/members/Matti1/sessions')

      expect(res.body.sessions[0].isCurrent).toBe(false)
    })
  })

  describe('DELETE /:sessionId', () => {
    it('terminates a members own other session and records it in the audit log', async () => {
      mockGetSessionById.mockResolvedValue(aRow({ id: OTHER_SESSION, memberId: 'Matti1' }))

      const res = await request(app)
        .delete(`/api/v1/members/me/sessions/${OTHER_SESSION}`)
        .set('user-agent', 'jest-agent')

      expect(res.status).toBe(200)
      expect(mockRevokeSession).toHaveBeenCalledWith(OTHER_SESSION, 'user_terminated')
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'Matti1',
        'session_terminated',
        expect.any(String),
        'jest-agent',
      )
    })

    it('refuses to terminate the callers own current session — that is logout job', async () => {
      const res = await request(app).delete(`/api/v1/members/me/sessions/${OWN_SESSION}`)

      expect(res.status).toBe(409)
      expect(mockGetSessionById).not.toHaveBeenCalled()
      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it('answers 404, not a 500, for an id that is not even a UUID', async () => {
      // member.sessions.id is a UUID column: without the shape check Postgres
      // raises on the comparison and a mistyped URL becomes a server error.
      const res = await request(app).delete('/api/v1/members/me/sessions/not-a-uuid')

      expect(res.status).toBe(404)
      expect(mockGetSessionById).not.toHaveBeenCalled()
    })

    it('answers 404 for an id that matches no session', async () => {
      mockGetSessionById.mockResolvedValue(undefined)

      const res = await request(app).delete(`/api/v1/members/me/sessions/${OTHER_SESSION}`)

      expect(res.status).toBe(404)
      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it('answers 404, not 200, when the session belongs to a different member', async () => {
      mockGetSessionById.mockResolvedValue(aRow({ id: STRANGERS_SESSION, memberId: 'Pekka1' }))

      const res = await request(app).delete(`/api/v1/members/me/sessions/${STRANGERS_SESSION}`)

      expect(res.status).toBe(404)
      expect(mockRevokeSession).not.toHaveBeenCalled()
    })

    it('answers 404 when the session was already revoked', async () => {
      mockGetSessionById.mockResolvedValue(aRow({ id: OTHER_SESSION, memberId: 'Matti1' }))
      mockRevokeSession.mockResolvedValue(false)

      const res = await request(app).delete(`/api/v1/members/me/sessions/${OTHER_SESSION}`)

      expect(res.status).toBe(404)
      expect(mockCreateLoginEvent).not.toHaveBeenCalled()
    })

    it("lets an admin terminate another member's session, attributed to that member", async () => {
      mockUser = identities.admin
      mockGetSessionById.mockResolvedValue(aRow({ id: OTHER_SESSION, memberId: 'Matti1' }))

      const res = await request(app)
        .delete(`/api/v1/members/Matti1/sessions/${OTHER_SESSION}`)
        .set('user-agent', 'jest-agent')

      expect(res.status).toBe(200)
      expect(mockRevokeSession).toHaveBeenCalledWith(OTHER_SESSION, 'admin_terminated')
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'Matti1',
        'session_terminated',
        expect.any(String),
        'jest-agent',
      )
    })

    it.each([
      ['ordinary member', identities.member],
      ['member without permissions', identities.noPermissions],
    ])("refuses %s terminating another member's session", async (_name, identity) => {
      mockUser = identity

      const res = await request(app).delete(`/api/v1/members/Pekka1/sessions/${STRANGERS_SESSION}`)

      expect(res.status).toBe(403)
      expect(mockRevokeSession).not.toHaveBeenCalled()
    })
  })

  describe('POST /revoke-others', () => {
    it('spares the callers current session and reports how many went', async () => {
      mockRevokeOtherSessions.mockResolvedValue(3)

      const res = await request(app)
        .post('/api/v1/members/me/sessions/revoke-others')
        .set('user-agent', 'jest-agent')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, revokedCount: 3 })
      expect(mockRevokeOtherSessions).toHaveBeenCalledWith(
        'Matti1',
        OWN_SESSION,
        'bulk_logout_others',
      )
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'Matti1',
        'sessions_bulk_revoked',
        expect.any(String),
        'jest-agent',
      )
    })

    it('spares nothing when the callers token predates session ids', async () => {
      mockUser = { ...identities.member, sid: undefined }

      await request(app).post('/api/v1/members/me/sessions/revoke-others')

      expect(mockRevokeOtherSessions).toHaveBeenCalledWith('Matti1', null, 'bulk_logout_others')
    })

    it('revokes every session when an admin acts on another member, sparing none', async () => {
      mockUser = identities.admin
      mockRevokeOtherSessions.mockResolvedValue(2)

      const res = await request(app).post('/api/v1/members/Matti1/sessions/revoke-others')

      expect(res.status).toBe(200)
      // null, not the admin's own OWN_SESSION: the admin is on none of the
      // target's devices, so sparing "the current one" would spare a stranger's.
      expect(mockRevokeOtherSessions).toHaveBeenCalledWith('Matti1', null, 'bulk_logout_others')
    })

    it.each([
      ['ordinary member', identities.member],
      ['member without permissions', identities.noPermissions],
    ])('refuses %s acting on another member', async (_name, identity) => {
      mockUser = identity

      const res = await request(app).post('/api/v1/members/Pekka1/sessions/revoke-others')

      expect(res.status).toBe(403)
      expect(mockRevokeOtherSessions).not.toHaveBeenCalled()
    })
  })
})
