import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import { MIKPermissions } from '@mik/contracts/members'

const mockGetNotificationBanner = jest.fn<(...args: any[]) => Promise<any>>()
const mockSetNotificationBanner = jest.fn<(...args: any[]) => Promise<void>>()

jest.unstable_mockModule('../../../src/db/notification-banner-queries.ts', () => ({
  getNotificationBanner: mockGetNotificationBanner,
  setNotificationBanner: mockSetNotificationBanner,
}))

// Mock validateUser to allow testing with different permission levels
let mockUserPermissions: MIKPermissions[] = []

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    (...permissions: MIKPermissions[]) =>
    (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = {
        memberId: 'test-admin',
        lastName: 'Admin',
        email: 'admin@test.com',
        roles: [],
        permissions: mockUserPermissions,
        canMakeReservations: true,
      }
      if (permissions.length === 0) {
        return next()
      }
      if (permissions.some((p) => mockUserPermissions.includes(p))) {
        return next()
      }
      return _res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Protected Content' })
    },
}))

const { router } = await import('../../../src/routes/notification-banner/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/notification-banner', router)
app.use(problemErrorHandler)

describe('Notification Banner API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPermissions = []
  })

  describe('GET /api/v1/notification-banner', () => {
    it('should return the current banner (no auth required)', async () => {
      const banner = { enabled: true, message: 'Maintenance in progress', severity: 'warning' }
      mockGetNotificationBanner.mockResolvedValue(banner)

      const response = await request(app).get('/api/v1/notification-banner')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(banner)
      expect(mockGetNotificationBanner).toHaveBeenCalledTimes(1)
    })

    it('should return null message when no banner is set', async () => {
      mockGetNotificationBanner.mockResolvedValue({
        enabled: false,
        message: null,
        severity: 'info',
      })

      const response = await request(app).get('/api/v1/notification-banner')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ enabled: false, message: null, severity: 'info' })
    })
  })

  describe('PUT /api/v1/notification-banner', () => {
    it('should update the banner when called by admin', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
      const banner = { enabled: true, message: 'System maintenance', severity: 'error' }
      mockSetNotificationBanner.mockResolvedValue(undefined)

      const response = await request(app).put('/api/v1/notification-banner').send(banner)

      expect(response.status).toBe(200)
      expect(response.body).toEqual(banner)
      expect(mockSetNotificationBanner).toHaveBeenCalledWith(banner, expect.any(Object))
    })

    it('should clear the banner when message is null', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
      const banner = { enabled: false, message: null, severity: 'info' }
      mockSetNotificationBanner.mockResolvedValue(undefined)

      const response = await request(app).put('/api/v1/notification-banner').send(banner)

      expect(response.status).toBe(200)
      expect(response.body).toEqual(banner)
    })

    it('should reject missing enabled flag', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'test', severity: 'info' })

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid notification banner data')
      expect(mockSetNotificationBanner).not.toHaveBeenCalled()
    })

    it('should reject missing severity', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'test', enabled: true })

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid notification banner data')
      expect(mockSetNotificationBanner).not.toHaveBeenCalled()
    })

    it('should reject invalid severity value', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'test', severity: 'critical', enabled: true })

      expect(response.status).toBe(400)
      expect(mockSetNotificationBanner).not.toHaveBeenCalled()
    })

    it('should reject message longer than 500 characters', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'a'.repeat(501), severity: 'info', enabled: true })

      expect(response.status).toBe(400)
      expect(mockSetNotificationBanner).not.toHaveBeenCalled()
    })

    it('should return 403 when user is not admin', async () => {
      mockUserPermissions = [] // no permissions

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'test', severity: 'info', enabled: true })

      expect(response.status).toBe(403)
      expect(mockSetNotificationBanner).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER_ADMIN]
      mockSetNotificationBanner.mockRejectedValue(new Error('DB error'))

      const response = await request(app)
        .put('/api/v1/notification-banner')
        .send({ message: 'test', severity: 'info', enabled: true })

      expect(response.status).toBe(500)
      expect(response.body.detail).toBe('Failed to update notification banner')
    })
  })
})
