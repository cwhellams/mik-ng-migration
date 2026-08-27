import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// --- Module mocks (must be set up BEFORE importing the route) -----------------

const mockSendEmail = jest.fn<(...args: unknown[]) => Promise<void>>()
mockSendEmail.mockResolvedValue(undefined)

jest.unstable_mockModule('../../../src/lib/sendGmail.ts', () => ({
  sendEmail: mockSendEmail,
}))

const mockVerifyTurnstileToken = jest.fn<(token: string, ip?: string) => Promise<boolean>>()

jest.unstable_mockModule('../../../src/services/turnstile.ts', () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
}))

jest.unstable_mockModule('../../../src/templates/renderEmail.ts', () => ({
  renderEmail: jest.fn(() => ({ subject: 'stub subject', html: '<html>stub</html>' })),
}))

// --- Import router after mocks are set up ------------------------------------

const { router } = await import('../../../src/routes/auth/contact.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/auth', router)
app.use(problemErrorHandler)

const validBody = (email: string) => ({
  name: 'Jane Doe',
  email,
  category: 'OTHER',
  message: 'Hello, I have a question.',
  lang: 'en',
})

// --- Tests -------------------------------------------------------------------

describe('POST /api/auth/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendEmail.mockResolvedValue(undefined)
    delete process.env.TURNSTILE_ENABLED
  })

  it('sends a notification and acknowledgement email and returns 204 on a valid submission', async () => {
    const res = await request(app).post('/api/auth/contact').send(validBody('happy@example.com'))

    expect(res.status).toBe(204)
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid payload with a Problem response', async () => {
    const res = await request(app)
      .post('/api/auth/contact')
      .send({ ...validBody('invalid@example.com'), email: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('rejects a submission missing a Turnstile token when Turnstile is enabled', async () => {
    process.env.TURNSTILE_ENABLED = 'true'

    const res = await request(app).post('/api/auth/contact').send(validBody('no-token@example.com'))

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('rejects a submission with an invalid Turnstile token', async () => {
    process.env.TURNSTILE_ENABLED = 'true'
    mockVerifyTurnstileToken.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/contact')
      .send({ ...validBody('bad-token@example.com'), turnstileToken: 'bad-token' })

    expect(res.status).toBe(400)
    expect(res.type).toBe('application/problem+json')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('accepts a submission with a valid Turnstile token', async () => {
    process.env.TURNSTILE_ENABLED = 'true'
    mockVerifyTurnstileToken.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/contact')
      .send({ ...validBody('good-token@example.com'), turnstileToken: 'good-token' })

    expect(res.status).toBe(204)
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })

  it('rate limits repeated submissions from the same email', async () => {
    const email = 'repeat@example.com'
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/auth/contact').send(validBody(email))
      expect(res.status).toBe(204)
    }

    const res = await request(app).post('/api/auth/contact').send(validBody(email))

    expect(res.status).toBe(429)
    expect(res.type).toBe('application/problem+json')
  })
})
