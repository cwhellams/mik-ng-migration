import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// --- Module mocks (must be set up BEFORE importing the route) -----------------

const mockGetMemberByEmail = jest.fn<(email: string) => Promise<any>>()
const mockGetMemberById = jest.fn<(id: string) => Promise<any>>()
const mockGetPasskeysByMemberId = jest.fn<(id: string) => Promise<any[]>>()
const mockGetPasskeyByCredentialId = jest.fn<(credentialId: string) => Promise<any>>()
const mockGetPasskeyById = jest.fn<(id: string) => Promise<any>>()
const mockInsertPasskey = jest.fn<(input: any) => Promise<string>>()
const mockUpdatePasskeyCounter = jest.fn<(...a: any[]) => Promise<void>>()
const mockDeletePasskey = jest.fn<(...a: any[]) => Promise<boolean>>()
const mockDeletePasskeyById = jest.fn<(...a: any[]) => Promise<boolean>>()
const mockRenamePasskey = jest.fn<(...a: any[]) => Promise<boolean>>()
const mockStoreChallenge = jest.fn<(...a: any[]) => Promise<void>>()
const mockClaimChallenge = jest.fn<(...a: any[]) => Promise<string | undefined>>()
const mockCreateLoginEvent = jest.fn<(...a: any[]) => Promise<void>>()

const mockGenerateRegistrationOptions = jest.fn<(...a: any[]) => Promise<any>>()
const mockVerifyRegistrationResponse = jest.fn<(...a: any[]) => Promise<any>>()
const mockGenerateAuthenticationOptions = jest.fn<(...a: any[]) => Promise<any>>()
const mockVerifyAuthenticationResponse = jest.fn<(...a: any[]) => Promise<any>>()

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  getMemberByEmail: mockGetMemberByEmail,
  getMemberById: mockGetMemberById,
}))

jest.unstable_mockModule('../../../src/db/passkey-queries.ts', () => ({
  getPasskeysByMemberId: mockGetPasskeysByMemberId,
  getPasskeyByCredentialId: mockGetPasskeyByCredentialId,
  getPasskeyById: mockGetPasskeyById,
  insertPasskey: mockInsertPasskey,
  updatePasskeyCounter: mockUpdatePasskeyCounter,
  deletePasskey: mockDeletePasskey,
  deletePasskeyById: mockDeletePasskeyById,
  renamePasskey: mockRenamePasskey,
  storeChallenge: mockStoreChallenge,
  claimChallenge: mockClaimChallenge,
}))

jest.unstable_mockModule('../../../src/db/auth-queries.ts', () => ({
  createLoginEvent: mockCreateLoginEvent,
}))

const mockCreateSession = jest.fn<(...a: any[]) => Promise<string>>()

jest.unstable_mockModule('../../../src/db/session-queries.ts', () => ({
  createSession: mockCreateSession,
  touchSession: jest.fn(),
  revokeSession: jest.fn(),
  revokeOtherSessions: jest.fn(),
  getActiveSessionsForMember: jest.fn(),
  getSessionById: jest.fn(),
}))

jest.unstable_mockModule('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}))

let mockUser: any = {
  memberId: 'tester01',
  lastName: 'Tester',
  email: 'test@example.com',
  roles: [],
  permissions: [],
  canMakeReservations: false,
}

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = mockUser
      next()
    },
}))

// --- Set required env -------------------------------------------------------

process.env.PUBLIC_URL = 'https://intra.test.example.com'
process.env.ACCESS_TOKEN_SECRET = 'access-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
process.env.ACCESS_TOKEN_EXPIRATION = '1h'
process.env.REFRESH_TOKEN_EXPIRATION = '7d'

const { passkeyRouter, memberPasskeysRouter } = await import('../../../src/routes/auth/passkey.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { decodeRefreshToken } = await import('../../../src/routes/auth/token.ts')

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  // express does not parse cookies in tests; not needed for these endpoints
  ;(req as any).cookies = {}
  next()
})
app.use('/api/auth/passkey', passkeyRouter)
app.use('/api/v1/members/me/passkeys', memberPasskeysRouter)
app.use('/api/v1/members/:memberId/passkeys', memberPasskeysRouter)
app.use(problemErrorHandler)

describe('Passkey routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateSession.mockResolvedValue('cccccccc-cccc-cccc-cccc-cccccccccccc')
    mockUser = {
      memberId: 'tester01',
      lastName: 'Tester',
      email: 'test@example.com',
      roles: [],
      permissions: [],
      canMakeReservations: false,
    }
  })

  describe('POST /registration/options', () => {
    it('generates options that allow both platform and cross-platform authenticators', async () => {
      mockGetPasskeysByMemberId.mockResolvedValue([])
      mockGenerateRegistrationOptions.mockResolvedValue({
        challenge: 'abc',
        rp: { name: 'MIK', id: 'intra.test.example.com' },
      })
      mockStoreChallenge.mockResolvedValue()

      const res = await request(app).post('/api/auth/passkey/registration/options')

      expect(res.status).toBe(200)
      const callArgs = mockGenerateRegistrationOptions.mock.calls[0][0] as any
      // The implementation must NOT restrict authenticatorAttachment so that
      // both browser/OS passkeys and hardware keys (YubiKey) work.
      expect(callArgs.authenticatorSelection.authenticatorAttachment).toBeUndefined()
      // userVerification 'preferred' lets hardware keys without UV register.
      expect(callArgs.authenticatorSelection.userVerification).toBe('preferred')
      // residentKey 'preferred' allows both discoverable and non-discoverable creds.
      expect(callArgs.authenticatorSelection.residentKey).toBe('preferred')
      // ES256 (-7) is the most widely-supported algorithm including YubiKey.
      expect(callArgs.supportedAlgorithmIDs).toContain(-7)

      expect(mockStoreChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'tester01',
          purpose: 'registration',
          challenge: 'abc',
        }),
      )
    })

    it('passes existing passkeys as excludeCredentials to prevent duplicate registration', async () => {
      mockGetPasskeysByMemberId.mockResolvedValue([
        {
          id: 'p1',
          memberId: 'tester01',
          credentialId: 'cred-1',
          publicKey: Buffer.from([1, 2, 3]),
          counter: 0,
          transports: ['usb'],
          deviceType: null,
          backedUp: false,
          name: null,
          lastUsedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      mockGenerateRegistrationOptions.mockResolvedValue({ challenge: 'x' })

      await request(app).post('/api/auth/passkey/registration/options')

      const callArgs = mockGenerateRegistrationOptions.mock.calls[0][0] as any
      expect(callArgs.excludeCredentials).toEqual([
        expect.objectContaining({ id: 'cred-1', transports: ['usb'] }),
      ])
    })
  })

  describe('POST /registration/verify', () => {
    it('rejects when the challenge has expired', async () => {
      mockClaimChallenge.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/auth/passkey/registration/verify')
        .send({ response: { id: 'foo' } })

      expect(res.status).toBe(400)
      expect(mockInsertPasskey).not.toHaveBeenCalled()
    })

    it('persists the credential and records an audit event on success', async () => {
      mockClaimChallenge.mockResolvedValue('challenge-xyz')
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-new',
            publicKey: new Uint8Array([1, 2, 3]),
            counter: 0,
            transports: ['internal', 'hybrid'],
          },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      })
      mockGetPasskeyByCredentialId.mockResolvedValue(undefined)
      mockInsertPasskey.mockResolvedValue('pk-1')

      const res = await request(app)
        .post('/api/auth/passkey/registration/verify')
        .send({ response: { id: 'cred-new' }, name: 'My MacBook' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, id: 'pk-1' })
      expect(mockInsertPasskey).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'tester01',
          credentialId: 'cred-new',
          name: 'My MacBook',
          backedUp: true,
        }),
      )
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'tester01',
        'passkey_registered',
        expect.any(String),
        undefined,
      )
    })

    it('rejects duplicate credential ids', async () => {
      mockClaimChallenge.mockResolvedValue('chal')
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'dup', publicKey: new Uint8Array([1]), counter: 0, transports: [] },
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
        },
      })
      mockGetPasskeyByCredentialId.mockResolvedValue({ id: 'existing', memberId: 'someone' })

      const res = await request(app)
        .post('/api/auth/passkey/registration/verify')
        .send({ response: { id: 'dup' } })

      expect(res.status).toBe(409)
      expect(mockInsertPasskey).not.toHaveBeenCalled()
    })
  })

  describe('POST /authentication/options', () => {
    it('returns options and sessionId for discoverable (email-less) flow', async () => {
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'abc' })

      const res = await request(app).post('/api/auth/passkey/authentication/options').send({})

      expect(res.status).toBe(200)
      expect(typeof res.body.sessionId).toBe('string')
      expect(res.body.hasPasskeys).toBe(false)
      const callArgs = mockGenerateAuthenticationOptions.mock.calls[0][0] as any
      expect(callArgs.allowCredentials).toEqual([])
    })

    it('returns hasPasskeys=false when the email has no registered passkey', async () => {
      mockGetMemberByEmail.mockResolvedValue({ memberId: 'm1' })
      mockGetPasskeysByMemberId.mockResolvedValue([])
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'abc' })

      const res = await request(app)
        .post('/api/auth/passkey/authentication/options')
        .send({ email: 'someone@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.hasPasskeys).toBe(false)
    })

    it('returns hasPasskeys=true with allowCredentials when the user has passkeys', async () => {
      mockGetMemberByEmail.mockResolvedValue({ memberId: 'm1' })
      mockGetPasskeysByMemberId.mockResolvedValue([
        {
          id: 'p1',
          memberId: 'm1',
          credentialId: 'cred-1',
          publicKey: Buffer.from([1]),
          counter: 0,
          transports: ['usb', 'nfc'],
          deviceType: null,
          backedUp: false,
          name: 'YubiKey',
          lastUsedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ])
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'abc' })

      const res = await request(app)
        .post('/api/auth/passkey/authentication/options')
        .send({ email: 'has@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.hasPasskeys).toBe(true)
      const callArgs = mockGenerateAuthenticationOptions.mock.calls[0][0] as any
      expect(callArgs.allowCredentials).toEqual([
        expect.objectContaining({ id: 'cred-1', transports: ['usb', 'nfc'] }),
      ])
      expect(callArgs.userVerification).toBe('preferred')
    })

    it('does not leak whether email exists when the lookup returns no member', async () => {
      mockGetMemberByEmail.mockResolvedValue(undefined)
      mockGenerateAuthenticationOptions.mockResolvedValue({ challenge: 'abc' })

      const res = await request(app)
        .post('/api/auth/passkey/authentication/options')
        .send({ email: 'unknown@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.hasPasskeys).toBe(false)
    })
  })

  describe('POST /authentication/verify', () => {
    it('returns 401 for unknown credential id', async () => {
      mockGetPasskeyByCredentialId.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/auth/passkey/authentication/verify')
        .send({ response: { id: 'who?' } })

      expect(res.status).toBe(401)
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        null,
        'passkey_login_failed',
        expect.any(String),
        undefined,
      )
    })

    it('updates counter and issues cookies on success', async () => {
      mockGetPasskeyByCredentialId.mockResolvedValue({
        id: 'p1',
        memberId: 'm1',
        credentialId: 'cred-1',
        publicKey: Buffer.from([1, 2, 3]),
        counter: 5,
        transports: ['internal'],
        deviceType: 'multiDevice',
        backedUp: true,
        name: 'MacBook',
        lastUsedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
      mockClaimChallenge.mockResolvedValue('chal')
      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 6 },
      })
      mockGetMemberById.mockResolvedValue({
        memberId: 'm1',
        email: 'm1@example.com',
        lastName: 'X',
        roles: [],
        canMakeReservations: false,
      })

      const res = await request(app)
        .post('/api/auth/passkey/authentication/verify')
        .set('user-agent', 'jest-agent')
        .send({ email: 'm1@example.com', response: { id: 'cred-1' } })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      expect(mockUpdatePasskeyCounter).toHaveBeenCalledWith('p1', 6)
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'm1',
        'passkey_login_success',
        expect.any(String),
        'jest-agent',
      )
      // A passkey login is a sign-in like any other, so it opens a session
      // registry row (#1234) whose id is what the refresh token below carries.
      expect(mockCreateSession).toHaveBeenCalledWith('m1', expect.any(String), 'jest-agent')
      // Cookies must be set
      const setCookies = res.headers['set-cookie'] as unknown as string[]
      expect(Array.isArray(setCookies) ? setCookies : [setCookies]).toEqual(
        expect.arrayContaining([
          expect.stringContaining('accessToken='),
          expect.stringContaining('refreshToken='),
        ]),
      )

      const refresh = setCookies
        .find((c) => c.startsWith('refreshToken='))!
        .split(';')[0]
        .slice('refreshToken='.length)
      expect(decodeRefreshToken(refresh).jti).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc')
    })
  })

  describe('Member-scoped passkey management', () => {
    it('lists own passkeys via /me', async () => {
      mockGetPasskeysByMemberId.mockResolvedValue([
        {
          id: 'p1',
          memberId: 'tester01',
          credentialId: 'cred-1',
          publicKey: Buffer.from([1]),
          counter: 0,
          transports: ['usb'],
          deviceType: null,
          backedUp: false,
          name: 'YubiKey',
          lastUsedAt: null,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ])

      const res = await request(app).get('/api/v1/members/me/passkeys')
      expect(res.status).toBe(200)
      expect(res.body.passkeys).toHaveLength(1)
      expect(res.body.passkeys[0]).toEqual(
        expect.objectContaining({ id: 'p1', name: 'YubiKey', transports: ['usb'] }),
      )
      // The DTO should NOT leak credentialId or publicKey
      expect(res.body.passkeys[0].credentialId).toBeUndefined()
      expect(res.body.passkeys[0].publicKey).toBeUndefined()
    })

    it('forbids non-admin from listing another member’s passkeys', async () => {
      mockUser.permissions = []

      const res = await request(app).get('/api/v1/members/other-id/passkeys')
      expect(res.status).toBe(403)
      expect(mockGetPasskeysByMemberId).not.toHaveBeenCalled()
    })

    it('allows admin to list another member’s passkeys', async () => {
      mockUser.permissions = ['member.admin']
      mockGetPasskeysByMemberId.mockResolvedValue([])

      const res = await request(app).get('/api/v1/members/other-id/passkeys')
      expect(res.status).toBe(200)
      expect(mockGetPasskeysByMemberId).toHaveBeenCalledWith('other-id')
    })

    it('lets a member delete their own passkey', async () => {
      mockGetPasskeyById.mockResolvedValue({
        id: 'p1',
        memberId: 'tester01',
        credentialId: 'cred-1',
        publicKey: Buffer.from([1]),
        counter: 0,
        transports: [],
        deviceType: null,
        backedUp: false,
        name: null,
        lastUsedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
      mockDeletePasskey.mockResolvedValue(true)

      const res = await request(app).delete('/api/v1/members/me/passkeys/p1')
      expect(res.status).toBe(200)
      expect(mockDeletePasskey).toHaveBeenCalledWith('p1', 'tester01')
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'tester01',
        'passkey_removed',
        expect.any(String),
        undefined,
      )
    })

    it('lets an admin delete another member’s passkey and logs the actual owner', async () => {
      mockUser.permissions = ['member.admin']
      // The URL hint says m99 but the actual owner of p1 is m42 — the audit
      // log must record m42 (the real owner from the DB), not m99.
      mockGetPasskeyById.mockResolvedValue({
        id: 'p1',
        memberId: 'm42',
        credentialId: 'cred-1',
        publicKey: Buffer.from([1]),
        counter: 0,
        transports: [],
        deviceType: null,
        backedUp: false,
        name: null,
        lastUsedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
      mockDeletePasskeyById.mockResolvedValue(true)

      const res = await request(app).delete('/api/v1/members/m99/passkeys/p1')
      expect(res.status).toBe(200)
      expect(mockDeletePasskeyById).toHaveBeenCalledWith('p1')
      expect(mockDeletePasskey).not.toHaveBeenCalled()
      expect(mockCreateLoginEvent).toHaveBeenCalledWith(
        'm42',
        'passkey_removed',
        expect.any(String),
        undefined,
      )
    })

    it('returns 404 when self-delete targets a passkey owned by someone else', async () => {
      mockGetPasskeyById.mockResolvedValue({
        id: 'p1',
        memberId: 'someone-else',
        credentialId: 'cred-1',
        publicKey: Buffer.from([1]),
        counter: 0,
        transports: [],
        deviceType: null,
        backedUp: false,
        name: null,
        lastUsedAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
      const res = await request(app).delete('/api/v1/members/me/passkeys/p1')
      expect(res.status).toBe(404)
      expect(mockDeletePasskey).not.toHaveBeenCalled()
      expect(mockDeletePasskeyById).not.toHaveBeenCalled()
    })

    it('forbids non-admin from deleting another member’s passkey', async () => {
      const res = await request(app).delete('/api/v1/members/other-id/passkeys/p1')
      expect(res.status).toBe(403)
      expect(mockDeletePasskey).not.toHaveBeenCalled()
      expect(mockDeletePasskeyById).not.toHaveBeenCalled()
    })
  })
})
