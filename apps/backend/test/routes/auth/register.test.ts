import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// --- Module mocks (must be set up BEFORE importing the route) -----------------

const mockAddMember = jest.fn<(...args: unknown[]) => Promise<string>>()
mockAddMember.mockResolvedValue('Test1')

const mockGetMemberByEmail = jest.fn<(...args: unknown[]) => Promise<unknown>>()
mockGetMemberByEmail.mockResolvedValue(undefined)

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  addMember: mockAddMember,
  getMemberByEmail: mockGetMemberByEmail,
  getMemberById: jest.fn(),
  updateMember: jest.fn(),
}))

jest.unstable_mockModule('../../../src/db/invoicing-queries.ts', () => ({
  getArticleFees: jest.fn<(codes: string[]) => Promise<unknown[]>>().mockResolvedValue([]),
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

const mockSendEmail = jest.fn<(...args: unknown[]) => Promise<void>>()
mockSendEmail.mockResolvedValue(undefined)

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

const mockVerifyTurnstileToken = jest.fn<(token: string, ip?: string) => Promise<boolean>>()

jest.unstable_mockModule('../../../src/services/turnstile.ts', () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
}))

jest.unstable_mockModule('../../../src/routes/auth/magiclink.ts', () => ({
  buildMagicLinkHref: jest.fn(),
  resolveMagicLinkOrigin: jest.fn(),
  generateMagicLinkToken: jest.fn(),
  generateLoginCode: jest.fn(),
}))

jest.unstable_mockModule('../../../src/routes/auth/registration-verification.ts', () => ({
  MIKRegistrationVerificationStrategy: jest.fn().mockImplementation(() => ({
    generateVerificationLink: jest.fn(() => ({ href: 'https://intra.test/verify', code: 12345 })),
    verifyRegistration: jest.fn(),
  })),
}))

jest.unstable_mockModule('../../../src/templates/renderEmail.ts', () => ({
  renderEmail: jest.fn(() => ({ subject: 'stub subject', html: '<html>stub</html>' })),
}))

// --- Required env vars -------------------------------------------------------

process.env.ACCESS_TOKEN_SECRET = 'access-secret'
process.env.REFRESH_TOKEN_SECRET = 'refresh-secret'
process.env.ACCESS_TOKEN_EXPIRATION = '1h'
process.env.REFRESH_TOKEN_EXPIRATION = '7d'
process.env.PUBLIC_URL = 'https://intra.test.example.com'
process.env.MAGIC_LINK_SECRET = 'magic-link-secret'

// --- Import router after mocks are set up ------------------------------------

const { router } = await import('../../../src/routes/auth/login.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')
const { MIKMemberTypes, MIKLang, PrimaryMotivation, VoluntaryWorkAnswer } =
  await import('@mik/contracts/members')

const app = express()
app.use(express.json())
app.use('/api/auth', router)
app.use(problemErrorHandler)

// --- Tests -------------------------------------------------------------------

const validPayload = (email: string) => ({
  memberType: MIKMemberTypes.NONFLYING,
  email,
  firstName: 'Test',
  lastName: 'User',
  lang: MIKLang.EN,
  streetAddress: 'Test street 1',
  postcode: '00100',
  townCity: 'Helsinki',
  country: 'FI',
  applicationData: {
    primaryMotivation: PrimaryMotivation.FLY,
    coverLetter: 'test',
    voluntaryWork: VoluntaryWorkAnswer.YES,
    accidentHistory: false,
    criminalRecord: false,
    gdprAccepted: true,
    feesAcknowledged: true,
    rulesAccepted: true,
  },
})

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAddMember.mockResolvedValue('Test1')
    mockGetMemberByEmail.mockResolvedValue(undefined)
    mockSendEmail.mockResolvedValue(undefined)
    delete process.env.TURNSTILE_ENABLED
  })

  it('registers a member once every acceptance checkbox is ticked, returning the memberId as a reference', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validPayload('happy@example.com'))

    expect(res.status).toBe(200)
    expect(mockAddMember).toHaveBeenCalledTimes(1)
    expect(res.body.memberId).toBe('Test1')
  })

  it('rejects a submission missing feesAcknowledged', async () => {
    const payload = validPayload('no-fees@example.com')
    payload.applicationData.feesAcknowledged = false

    const res = await request(app).post('/api/auth/register').send(payload)

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockAddMember).not.toHaveBeenCalled()
  })

  it('rejects a submission missing rulesAccepted', async () => {
    const payload = validPayload('no-rules@example.com')
    payload.applicationData.rulesAccepted = false

    const res = await request(app).post('/api/auth/register').send(payload)

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockAddMember).not.toHaveBeenCalled()
  })

  it('stores rulesAccepted alongside the rest of the applicationData', async () => {
    await request(app).post('/api/auth/register').send(validPayload('stored@example.com'))

    expect(mockAddMember).toHaveBeenCalledTimes(1)
    const [storedMember] = mockAddMember.mock.calls[0] as [
      { applicationData: { rulesAccepted: boolean } },
    ]
    expect(storedMember.applicationData.rulesAccepted).toBe(true)
  })

  it('rejects a submission missing a Turnstile token when Turnstile is enabled', async () => {
    process.env.TURNSTILE_ENABLED = 'true'

    const res = await request(app)
      .post('/api/auth/register')
      .send(validPayload('no-token@example.com'))

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled()
    expect(mockAddMember).not.toHaveBeenCalled()
  })

  it('rejects a submission with an invalid Turnstile token', async () => {
    process.env.TURNSTILE_ENABLED = 'true'
    mockVerifyTurnstileToken.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload('bad-token@example.com'), turnstileToken: 'bad-token' })

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockAddMember).not.toHaveBeenCalled()
  })

  it('accepts a submission with a valid Turnstile token', async () => {
    process.env.TURNSTILE_ENABLED = 'true'
    mockVerifyTurnstileToken.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPayload('good-token@example.com'), turnstileToken: 'good-token' })

    expect(res.status).toBe(200)
    expect(mockAddMember).toHaveBeenCalledTimes(1)
  })
})
