import { jest, beforeEach, describe, expect, it } from '@jest/globals'
import express from 'express'
import request from 'supertest'

import { MIKPermissions } from '../../../src/routes/members/models.ts'

const mockGetAllEvents = jest.fn<() => Promise<unknown[]>>()
const mockGetEventById = jest.fn<() => Promise<unknown>>()
const mockCreateEvent = jest.fn<() => Promise<unknown>>()
const mockUpdateEvent = jest.fn<() => Promise<unknown>>()
const mockDeleteEvent = jest.fn<() => Promise<boolean>>()

jest.unstable_mockModule('../../../src/db/events-queries.ts', () => ({
  getAllEvents: mockGetAllEvents,
  getEventById: mockGetEventById,
  createEvent: mockCreateEvent,
  updateEvent: mockUpdateEvent,
  deleteEvent: mockDeleteEvent,
}))

let mockUserPermissions: MIKPermissions[] = []

jest.unstable_mockModule('../../../src/middleware/authMiddleware.ts', () => ({
  validateUser:
    (...permissions: MIKPermissions[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.user = {
        memberId: 'test-admin',
        lastName: 'Admin',
        email: 'admin@test.com',
        roles: [],
        permissions: mockUserPermissions,
        canMakeReservations: true,
      }

      if (
        permissions.length === 0 ||
        permissions.some((permission) => mockUserPermissions.includes(permission))
      ) {
        return next()
      }

      return res.status(403).json({ status: 403, title: 'Forbidden', detail: 'Protected Content' })
    },
}))

const { router } = await import('../../../src/routes/events/api.ts')
const { problemErrorHandler } = await import('../../../src/routes/response.ts')

const app = express()
app.use(express.json())
app.use('/api/v1/events', router)
app.use(problemErrorHandler)

const sampleEvent = {
  eventId: '8c3dcbe4-fcf8-4e2c-8dfe-33f820b937d0',
  title: 'Navigation training',
  description: 'Bring a chart',
  location: 'Clubhouse',
  startTime: '2026-05-29T15:00:00.000Z',
  endTime: '2026-05-29T17:00:00.000Z',
  isPublic: true,
  createdAt: '2026-05-01T10:00:00.000Z',
  createdBy: 'test-admin',
  updatedAt: '2026-05-01T10:00:00.000Z',
  updatedBy: 'test-admin',
}

describe('Events API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserPermissions = []
  })

  describe('GET /api/v1/events/public', () => {
    it('returns public events without authentication', async () => {
      mockGetAllEvents.mockResolvedValue([sampleEvent])

      const response = await request(app)
        .get('/api/v1/events/public')
        .query({ from: sampleEvent.startTime, to: sampleEvent.endTime })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ events: [sampleEvent] })
      expect(mockGetAllEvents).toHaveBeenCalledWith({
        publicOnly: true,
        from: sampleEvent.startTime,
        to: sampleEvent.endTime,
      })
    })

    it('rejects invalid datetime filters with 400', async () => {
      const response = await request(app).get('/api/v1/events/public').query({ from: 'not-a-date' })

      expect(response.status).toBe(400)
      expect(response.body.detail).toBe('Invalid event filters')
      expect(mockGetAllEvents).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/v1/events', () => {
    it('returns all events for members', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER]
      mockGetAllEvents.mockResolvedValue([sampleEvent])

      const response = await request(app).get('/api/v1/events')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ events: [sampleEvent] })
      expect(mockGetAllEvents).toHaveBeenCalledWith({
        from: undefined,
        to: undefined,
      })
    })
  })

  describe('POST /api/v1/events', () => {
    it('requires events admin permission', async () => {
      const response = await request(app).post('/api/v1/events').send({
        title: sampleEvent.title,
        startTime: sampleEvent.startTime,
        endTime: sampleEvent.endTime,
      })

      expect(response.status).toBe(403)
      expect(mockCreateEvent).not.toHaveBeenCalled()
    })

    it('creates events for admins', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockCreateEvent.mockResolvedValue(sampleEvent)

      const response = await request(app).post('/api/v1/events').send({
        title: sampleEvent.title,
        description: sampleEvent.description,
        location: sampleEvent.location,
        startTime: sampleEvent.startTime,
        endTime: sampleEvent.endTime,
        isPublic: true,
      })

      expect(response.status).toBe(201)
      expect(response.body).toEqual(sampleEvent)
      expect(mockCreateEvent).toHaveBeenCalledWith(
        {
          title: sampleEvent.title,
          description: sampleEvent.description,
          location: sampleEvent.location,
          startTime: sampleEvent.startTime,
          endTime: sampleEvent.endTime,
          isPublic: true,
        },
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })
  })

  describe('PUT /api/v1/events/:eventId', () => {
    it('keeps isPublic optional on updates', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockUpdateEvent.mockResolvedValue({
        ...sampleEvent,
        title: 'Updated event',
      })

      const response = await request(app)
        .put(`/api/v1/events/${sampleEvent.eventId}`)
        .send({ title: 'Updated event' })

      expect(response.status).toBe(200)
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        sampleEvent.eventId,
        { title: 'Updated event' },
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })
  })

  describe('DELETE /api/v1/events/:eventId', () => {
    it('deletes events for admins', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockDeleteEvent.mockResolvedValue(true)

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}`)

      expect(response.status).toBe(204)
      expect(mockDeleteEvent).toHaveBeenCalledWith(sampleEvent.eventId)
    })
  })

  describe('GET /api/v1/events/:eventId', () => {
    it('returns a single event for members', async () => {
      mockUserPermissions = [MIKPermissions.MEMBER]
      mockGetEventById.mockResolvedValue(sampleEvent)

      const response = await request(app).get(`/api/v1/events/${sampleEvent.eventId}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual(sampleEvent)
    })
  })
})
