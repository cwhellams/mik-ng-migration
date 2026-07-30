import { jest, beforeEach, describe, it, expect } from '@jest/globals'
import request from 'supertest'
import express from 'express'

// Mock the member-queries module before importing anything else
const mockGetDashboardSettings = jest.fn<(...args: any[]) => Promise<any>>()
const mockSetDashboardSettings = jest.fn<(...args: any[]) => Promise<void>>()

jest.unstable_mockModule('../../../src/db/member-queries.ts', () => ({
  getDashboardSettings: mockGetDashboardSettings,
  setDashboardSettings: mockSetDashboardSettings,
}))

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser: () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Mock user for tests
    req.user = {
      memberId: 'test-member-123',
      lastName: 'Test',
      email: 'test@example.com',
      roles: [],
      permissions: [],
      canMakeReservations: true,
    }
    next()
  },
}))

const { router } = await import('../../../src/routes/dashboard/api.ts')
const { DEFAULT_DASHBOARD_COMPONENTS } = await import('../../../src/routes/dashboard/models.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/dashboard', router)
app.use(problemErrorHandler) // Add error handler middleware

describe('Dashboard API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/v1/dashboard/settings', () => {
    it('should return existing dashboard settings when they exist', async () => {
      const mockSettings = {
        components: [
          { id: 'weather', visible: true, order: 0 },
          { id: 'bookingUser', visible: false, order: 1 },
        ],
      }
      mockGetDashboardSettings.mockResolvedValue(mockSettings)

      const response = await request(app).get('/api/v1/dashboard/settings')

      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockSettings)
      expect(mockGetDashboardSettings).toHaveBeenCalledWith('test-member-123')
    })

    it('should return default settings when no settings exist', async () => {
      mockGetDashboardSettings.mockResolvedValue(null)

      const response = await request(app).get('/api/v1/dashboard/settings')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        components: DEFAULT_DASHBOARD_COMPONENTS,
      })
      expect(mockGetDashboardSettings).toHaveBeenCalledWith('test-member-123')
    })
  })

  describe('PUT /api/v1/dashboard/settings', () => {
    it('should update dashboard settings with valid data', async () => {
      const validSettings = {
        components: [
          { id: 'weather', visible: true, order: 0 },
          { id: 'bookingUser', visible: false, order: 1 },
          { id: 'flightLogUser', visible: true, order: 2 },
        ],
      }
      mockSetDashboardSettings.mockResolvedValue(undefined)

      const response = await request(app).put('/api/v1/dashboard/settings').send(validSettings)

      expect(response.status).toBe(200)
      expect(response.body).toEqual(validSettings)
      expect(mockSetDashboardSettings).toHaveBeenCalledWith('test-member-123', validSettings)
    })

    it('should accept all default dashboard components', async () => {
      const allComponents = {
        components: DEFAULT_DASHBOARD_COMPONENTS,
      }
      mockSetDashboardSettings.mockResolvedValue(undefined)

      const response = await request(app).put('/api/v1/dashboard/settings').send(allComponents)

      expect(response.status).toBe(200)
      expect(response.body).toEqual(allComponents)
      expect(mockSetDashboardSettings).toHaveBeenCalledWith('test-member-123', allComponents)
    })

    it('should reject invalid data - missing components array', async () => {
      const invalidSettings = {
        notComponents: [],
      }

      const response = await request(app).put('/api/v1/dashboard/settings').send(invalidSettings)

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid dashboard settings')
      expect(response.body.errors).toBeDefined()
      expect(mockSetDashboardSettings).not.toHaveBeenCalled()
    })

    it('should reject invalid data - missing required component fields', async () => {
      const invalidSettings = {
        components: [
          { id: 'weather' }, // missing visible and order
        ],
      }

      const response = await request(app).put('/api/v1/dashboard/settings').send(invalidSettings)

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid dashboard settings')
      expect(response.body.errors).toBeDefined()
      expect(mockSetDashboardSettings).not.toHaveBeenCalled()
    })

    it('should reject invalid data - wrong types', async () => {
      const invalidSettings = {
        components: [
          { id: 'weather', visible: 'yes', order: 'first' }, // wrong types
        ],
      }

      const response = await request(app).put('/api/v1/dashboard/settings').send(invalidSettings)

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid dashboard settings')
      expect(mockSetDashboardSettings).not.toHaveBeenCalled()
    })

    it('should reject invalid data - negative order', async () => {
      const invalidSettings = {
        components: [{ id: 'weather', visible: true, order: -1 }],
      }

      const response = await request(app).put('/api/v1/dashboard/settings').send(invalidSettings)

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid dashboard settings')
      expect(mockSetDashboardSettings).not.toHaveBeenCalled()
    })

    it('should reject invalid data - non-integer order', async () => {
      const invalidSettings = {
        components: [{ id: 'weather', visible: true, order: 1.5 }],
      }

      const response = await request(app).put('/api/v1/dashboard/settings').send(invalidSettings)

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid dashboard settings')
      expect(mockSetDashboardSettings).not.toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      const validSettings = {
        components: [{ id: 'weather', visible: true, order: 0 }],
      }
      mockSetDashboardSettings.mockRejectedValue(new Error('Database error'))

      const response = await request(app).put('/api/v1/dashboard/settings').send(validSettings)

      expect(response.status).toBe(500)
      expect(response.body.detail).toBe('Failed to update dashboard settings')
      expect(mockSetDashboardSettings).toHaveBeenCalledWith('test-member-123', validSettings)
    })
  })
})
