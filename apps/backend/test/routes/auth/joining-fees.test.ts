import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// --- Module mocks (must be set up BEFORE importing the route) -----------------

type ArticleFeeRow = { id: number; code: string; name: string; price_per_unit?: number }

const mockGetArticleFees = jest.fn<(codes: string[]) => Promise<ArticleFeeRow[]>>()

jest.unstable_mockModule('../../../src/db/invoicing-queries.ts', () => ({
  getArticleFees: mockGetArticleFees,
}))

// Minimal stubs for the other modules that login.ts imports at module-load time.
jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  addMember: jest.fn(),
  getMemberByEmail: jest.fn(),
  getMemberById: jest.fn(),
  updateMember: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/auth-queries.ts', () => ({
  claimLoginAttemptByTokenHash: jest.fn(),
  createLoginAttempt: jest.fn(),
  createLoginEvent: jest.fn(),
  getActiveLoginAttempt: jest.fn(),
  incrementLoginAttemptFailures: jest.fn(),
  invalidatePreviousLoginAttempts: jest.fn(),
  markLoginAttemptUsed: jest.fn(),
}))

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: jest.fn(),
}))

jest.unstable_mockModule('../../../src/services/turnstile.ts', () => ({
  verifyTurnstileToken: jest.fn(),
}))

jest.unstable_mockModule('../../../src/routes/auth/magiclink.ts', () => ({
  buildMagicLinkHref: jest.fn(),
  generateMagicLinkToken: jest.fn(),
  generateLoginCode: jest.fn(),
}))

jest.unstable_mockModule('../../../src/routes/auth/registration-verification.ts', () => ({
  MIKRegistrationVerificationStrategy: jest.fn().mockImplementation(() => ({
    generateVerificationLink: jest.fn(),
    verifyRegistration: jest.fn(),
  })),
}))

jest.unstable_mockModule('../../../src/templates/loginEmailTemplate.ts', () => ({
  loginEmailTitle: jest.fn(),
  loginEmailBodyHtml: jest.fn(),
}))

jest.unstable_mockModule('../../../src/templates/registrationEmailTemplate.ts', () => ({
  registerEmailBodyHtml: jest.fn(),
  registerEmailTitle: jest.fn(),
}))

// --- Required env vars -------------------------------------------------------

process.env.ACCESS_TOKEN_SECRET = 'access-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
process.env.ACCESS_TOKEN_EXPIRATION = '1h'
process.env.REFRESH_TOKEN_EXPIRATION = '7d'
process.env.PUBLIC_URL = 'https://intra.test.example.com'

// --- Import router after mocks are set up ------------------------------------

const { router } = await import('../../../src/routes/auth/login.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/auth', router)
app.use(problemErrorHandler)

// --- Tests -------------------------------------------------------------------

describe('GET /api/auth/joining-fees', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns fullMemberFee and reducedMemberFee when all three codes are present', async () => {
    mockGetArticleFees.mockResolvedValue([
      { id: 1, code: 'LIITTYMINEN', name: 'Full member joining fee', price_per_unit: 125 },
      { id: 2, code: 'NLIITTYMINEN', name: 'Junior joining fee', price_per_unit: 25 },
      { id: 3, code: 'KLIITTYMINEN', name: 'Supporting member joining fee', price_per_unit: 25 },
    ])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ fullMemberFee: 125, reducedMemberFee: 25 })
  })

  it('falls back to supporting-member code when junior code is absent', async () => {
    mockGetArticleFees.mockResolvedValue([
      { id: 1, code: 'LIITTYMINEN', name: 'Full member joining fee', price_per_unit: 125 },
      { id: 3, code: 'KLIITTYMINEN', name: 'Supporting member joining fee', price_per_unit: 30 },
    ])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ fullMemberFee: 125, reducedMemberFee: 30 })
  })

  it('returns null for reducedMemberFee when neither junior nor supporting codes are present', async () => {
    mockGetArticleFees.mockResolvedValue([
      { id: 1, code: 'LIITTYMINEN', name: 'Full member joining fee', price_per_unit: 125 },
    ])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ fullMemberFee: 125, reducedMemberFee: null })
  })

  it('returns null for fullMemberFee when full-member code is absent', async () => {
    mockGetArticleFees.mockResolvedValue([
      { id: 2, code: 'NLIITTYMINEN', name: 'Junior joining fee', price_per_unit: 25 },
    ])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ fullMemberFee: null, reducedMemberFee: 25 })
  })

  it('returns null for both fees when the database returns an empty list', async () => {
    mockGetArticleFees.mockResolvedValue([])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ fullMemberFee: null, reducedMemberFee: null })
  })

  it('does not require authentication', async () => {
    mockGetArticleFees.mockResolvedValue([])

    const res = await request(app).get('/api/auth/joining-fees')

    expect(res.status).toBe(200)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('fetches all three article codes from the database', async () => {
    mockGetArticleFees.mockResolvedValue([])

    await request(app).get('/api/auth/joining-fees')

    expect(mockGetArticleFees).toHaveBeenCalledTimes(1)
    const calledWith = mockGetArticleFees.mock.calls[0][0]
    expect(calledWith).toContain('LIITTYMINEN')
    expect(calledWith).toContain('NLIITTYMINEN')
    expect(calledWith).toContain('KLIITTYMINEN')
  })
})
