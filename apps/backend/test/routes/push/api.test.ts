import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

const mockGetPushSubscriptionsByMemberId = jest.fn<(memberId: string) => Promise<any[]>>()
const mockUpsertPushSubscription = jest.fn<(input: any) => Promise<string>>()
const mockDeletePushSubscriptionByEndpoint =
  jest.fn<(memberId: string, endpoint: string) => Promise<boolean>>()

jest.unstable_mockModule('../../../src/db/push-queries.ts', () => ({
  getPushSubscriptionsByMemberId: mockGetPushSubscriptionsByMemberId,
  upsertPushSubscription: mockUpsertPushSubscription,
  deletePushSubscriptionByEndpoint: mockDeletePushSubscriptionByEndpoint,
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

const { router: pushRoutes } = await import('../../../src/routes/push/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/push', pushRoutes)
app.use(problemErrorHandler)

describe('Push subscription routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.VAPID_PUBLIC_KEY
  })

  describe('GET /vapid-public-key', () => {
    it('returns the configured public key', async () => {
      process.env.VAPID_PUBLIC_KEY = 'test-public-key'

      const res = await request(app).get('/api/v1/push/vapid-public-key')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ publicKey: 'test-public-key' })
    })

    it('returns 503 when VAPID is not configured', async () => {
      const res = await request(app).get('/api/v1/push/vapid-public-key')

      expect(res.status).toBe(503)
    })
  })

  describe('POST /subscribe', () => {
    it('stores a valid subscription for the current member', async () => {
      mockUpsertPushSubscription.mockResolvedValue('sub-1')

      const res = await request(app)
        .post('/api/v1/push/subscribe')
        .send({
          endpoint: 'https://push.example.com/abc',
          keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
        })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, id: 'sub-1' })
      expect(mockUpsertPushSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'tester01',
          endpoint: 'https://push.example.com/abc',
          keysAuth: 'auth-key',
          keysP256dh: 'p256dh-key',
        }),
      )
    })

    it('rejects a payload missing required fields', async () => {
      const res = await request(app).post('/api/v1/push/subscribe').send({ endpoint: '' })

      expect(res.status).toBe(400)
      expect(mockUpsertPushSubscription).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /subscribe', () => {
    it('removes an existing subscription', async () => {
      mockDeletePushSubscriptionByEndpoint.mockResolvedValue(true)

      const res = await request(app)
        .delete('/api/v1/push/subscribe')
        .send({ endpoint: 'https://push.example.com/abc' })

      expect(res.status).toBe(200)
      expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(
        'tester01',
        'https://push.example.com/abc',
      )
    })

    it('returns 404 when the subscription does not exist', async () => {
      mockDeletePushSubscriptionByEndpoint.mockResolvedValue(false)

      const res = await request(app)
        .delete('/api/v1/push/subscribe')
        .send({ endpoint: 'https://push.example.com/missing' })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /subscriptions', () => {
    it('lists the current member subscriptions without exposing keys', async () => {
      mockGetPushSubscriptionsByMemberId.mockResolvedValue([
        {
          id: 'sub-1',
          memberId: 'tester01',
          endpoint: 'https://push.example.com/abc',
          keysAuth: 'secret-auth',
          keysP256dh: 'secret-p256dh',
          userAgent: 'test-agent',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ])

      const res = await request(app).get('/api/v1/push/subscriptions')

      expect(res.status).toBe(200)
      expect(res.body.subscriptions).toEqual([
        {
          id: 'sub-1',
          endpoint: 'https://push.example.com/abc',
          userAgent: 'test-agent',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ])
    })
  })
})
