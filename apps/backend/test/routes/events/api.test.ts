import { jest, beforeEach, describe, expect, it } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import sharp from 'sharp'

import { MIKPermissions } from '../../../src/routes/members/models.ts'

const mockGetAllEvents = jest.fn<(...args: any[]) => Promise<unknown[]>>()
const mockGetEventById = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockCreateEvent = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockUpdateEvent = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteEvent = jest.fn<(...args: any[]) => Promise<boolean>>()
const mockGetEventImageKey = jest.fn<(...args: any[]) => Promise<string | null | undefined>>()
const mockSetEventImage = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockClearEventImage = jest.fn<(...args: any[]) => Promise<unknown>>()

jest.unstable_mockModule('../../../src/db/events-queries.ts', () => ({
  getAllEvents: mockGetAllEvents,
  getEventById: mockGetEventById,
  createEvent: mockCreateEvent,
  updateEvent: mockUpdateEvent,
  deleteEvent: mockDeleteEvent,
  getEventImageKey: mockGetEventImageKey,
  setEventImage: mockSetEventImage,
  clearEventImage: mockClearEventImage,
}))

const mockUploadFile = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDeleteFile = jest.fn<(...args: any[]) => Promise<unknown>>()
const mockDownloadFile = jest.fn<(...args: any[]) => Promise<Buffer>>()

jest.unstable_mockModule('../../../src/services/storage.ts', () => ({
  storageService: {
    uploadFile: mockUploadFile,
    deleteFile: mockDeleteFile,
    downloadFile: mockDownloadFile,
  },
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
  imageUrl: 'https://mik.fi/events/navigation-training.jpg',
  performer: 'Jane Doe',
  translations: {},
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
    mockUploadFile.mockResolvedValue({ key: 'events/unused.jpg', url: 'unused' })
    mockDeleteFile.mockResolvedValue(undefined)
    mockDownloadFile.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))
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

  describe('GET /api/v1/events/images/:fileName', () => {
    it('serves the image without authentication', async () => {
      mockDownloadFile.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))

      const response = await request(app).get('/api/v1/events/images/abc123.jpg')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBe('image/jpeg')
      expect(response.headers['cache-control']).toContain('immutable')
      expect(mockDownloadFile).toHaveBeenCalledWith('events/abc123.jpg')
    })

    it('returns 404 when the image is not found', async () => {
      mockDownloadFile.mockRejectedValue(new Error('not found'))

      const response = await request(app).get('/api/v1/events/images/missing.jpg')

      expect(response.status).toBe(404)
    })

    it('rejects a fileName that smuggles path-traversal via an encoded slash', async () => {
      // Express decodes %2F inside a single :fileName param into a literal '/',
      // so without validation this would build the storage key
      // "events/../../documents/secret.pdf" and hand it straight to the S3 SDK.
      const response = await request(app).get(
        '/api/v1/events/images/..%2F..%2Fdocuments%2Fsecret.pdf',
      )

      expect(response.status).toBe(404)
      expect(mockDownloadFile).not.toHaveBeenCalled()
    })

    it('rejects a fileName with an unexpected extension or characters', async () => {
      const response = await request(app).get('/api/v1/events/images/abc123.pdf')

      expect(response.status).toBe(404)
      expect(mockDownloadFile).not.toHaveBeenCalled()
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
        performer: sampleEvent.performer,
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
          performer: sampleEvent.performer,
          startTime: sampleEvent.startTime,
          endTime: sampleEvent.endTime,
          isPublic: true,
        },
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })

    it('creates events without a performer', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockCreateEvent.mockResolvedValue({ ...sampleEvent, imageUrl: null, performer: null })

      const response = await request(app).post('/api/v1/events').send({
        title: sampleEvent.title,
        startTime: sampleEvent.startTime,
        endTime: sampleEvent.endTime,
      })

      expect(response.status).toBe(201)
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.not.objectContaining({ performer: expect.anything() }),
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })

    it('ignores an imageUrl sent in the body — images are only set via the upload endpoint', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockCreateEvent.mockResolvedValue(sampleEvent)

      const response = await request(app).post('/api/v1/events').send({
        title: sampleEvent.title,
        imageUrl: 'https://example.com/should-be-ignored.jpg',
        startTime: sampleEvent.startTime,
        endTime: sampleEvent.endTime,
      })

      expect(response.status).toBe(201)
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.not.objectContaining({ imageUrl: expect.anything() }),
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })

    it('accepts translations for finnish and swedish', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockCreateEvent.mockResolvedValue(sampleEvent)

      const response = await request(app)
        .post('/api/v1/events')
        .send({
          title: sampleEvent.title,
          startTime: sampleEvent.startTime,
          endTime: sampleEvent.endTime,
          translations: {
            fi: { title: 'Navigointikoulutus', description: 'Tuo kartta' },
            sv: { title: 'Navigeringsträning' },
          },
        })

      expect(response.status).toBe(201)
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: {
            fi: { title: 'Navigointikoulutus', description: 'Tuo kartta' },
            sv: { title: 'Navigeringsträning' },
          },
        }),
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })

    it('rejects a translation with an empty title with 400', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]

      const response = await request(app)
        .post('/api/v1/events')
        .send({
          title: sampleEvent.title,
          startTime: sampleEvent.startTime,
          endTime: sampleEvent.endTime,
          translations: { fi: { title: '' } },
        })

      expect(response.status).toBe(400)
      expect(mockCreateEvent).not.toHaveBeenCalled()
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

    it('allows clearing the performer with null', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockUpdateEvent.mockResolvedValue({ ...sampleEvent, performer: null })

      const response = await request(app)
        .put(`/api/v1/events/${sampleEvent.eventId}`)
        .send({ performer: null })

      expect(response.status).toBe(200)
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        sampleEvent.eventId,
        { performer: null },
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })

    it('passes a null translation through as an explicit delete instruction', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockUpdateEvent.mockResolvedValue(sampleEvent)

      const response = await request(app)
        .put(`/api/v1/events/${sampleEvent.eventId}`)
        .send({ translations: { fi: null } })

      expect(response.status).toBe(200)
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        sampleEvent.eventId,
        { translations: { fi: null } },
        expect.objectContaining({ memberId: 'test-admin' }),
      )
    })
  })

  describe('DELETE /api/v1/events/:eventId', () => {
    it('deletes events for admins', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue(null)
      mockDeleteEvent.mockResolvedValue(true)

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}`)

      expect(response.status).toBe(204)
      expect(mockDeleteEvent).toHaveBeenCalledWith(sampleEvent.eventId)
      expect(mockDeleteFile).not.toHaveBeenCalled()
    })

    it('deletes the stored image when the event had one', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue('events/old-image.jpg')
      mockDeleteEvent.mockResolvedValue(true)

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}`)

      expect(response.status).toBe(204)
      expect(mockDeleteFile).toHaveBeenCalledWith('events/old-image.jpg')
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

  describe('POST /api/v1/events/:eventId/image', () => {
    const tinyJpeg = async () =>
      sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
        .jpeg()
        .toBuffer()

    it('requires events admin permission', async () => {
      const response = await request(app)
        .post(`/api/v1/events/${sampleEvent.eventId}/image`)
        .attach('file', await tinyJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(response.status).toBe(403)
      expect(mockUploadFile).not.toHaveBeenCalled()
    })

    it('uploads and attaches the image to the event', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue(null)
      mockUploadFile.mockResolvedValue({ key: 'events/whatever.jpg', url: 'unused' })
      mockSetEventImage.mockResolvedValue({
        ...sampleEvent,
        imageUrl: 'http://localhost:3000/api/v1/events/images/whatever.jpg',
      })

      const response = await request(app)
        .post(`/api/v1/events/${sampleEvent.eventId}/image`)
        .attach('file', await tinyJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(response.status).toBe(200)
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/\.jpg$/),
        'image/jpeg',
        'events',
      )
      expect(mockSetEventImage).toHaveBeenCalledWith(
        sampleEvent.eventId,
        expect.stringContaining('/api/v1/events/images/'),
        expect.stringMatching(/^events\//),
      )
      expect(mockDeleteFile).not.toHaveBeenCalled()
    })

    it('deletes the previous image when replacing it', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue('events/old-image.jpg')
      mockUploadFile.mockResolvedValue({ key: 'events/new-image.jpg', url: 'unused' })
      mockSetEventImage.mockResolvedValue(sampleEvent)

      const response = await request(app)
        .post(`/api/v1/events/${sampleEvent.eventId}/image`)
        .attach('file', await tinyJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(response.status).toBe(200)
      expect(mockDeleteFile).toHaveBeenCalledWith('events/old-image.jpg')
    })

    it('rejects a non-image file', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]

      const response = await request(app)
        .post(`/api/v1/events/${sampleEvent.eventId}/image`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })

      // multer's fileFilter rejection surfaces as a generic error (500 via the
      // shared problemErrorHandler), consistent with the other upload endpoints
      // in this app (expenses, instructor-qualifications) which have the same behavior.
      expect(response.status).toBe(500)
      expect(mockUploadFile).not.toHaveBeenCalled()
    })

    it('returns 404 when the event does not exist', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue(undefined)

      const response = await request(app)
        .post(`/api/v1/events/${sampleEvent.eventId}/image`)
        .attach('file', await tinyJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(response.status).toBe(404)
      expect(mockUploadFile).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/v1/events/:eventId/image', () => {
    it('requires events admin permission', async () => {
      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}/image`)
      expect(response.status).toBe(403)
    })

    it('deletes the stored image and clears the event', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue('events/old-image.jpg')
      mockClearEventImage.mockResolvedValue({ ...sampleEvent, imageUrl: null })

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}/image`)

      expect(response.status).toBe(200)
      expect(mockDeleteFile).toHaveBeenCalledWith('events/old-image.jpg')
      expect(mockClearEventImage).toHaveBeenCalledWith(sampleEvent.eventId)
    })

    it('skips storage deletion for legacy events with no image_key', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue(null)
      mockClearEventImage.mockResolvedValue({ ...sampleEvent, imageUrl: null })

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}/image`)

      expect(response.status).toBe(200)
      expect(mockDeleteFile).not.toHaveBeenCalled()
      expect(mockClearEventImage).toHaveBeenCalledWith(sampleEvent.eventId)
    })

    it('returns 404 when the event does not exist', async () => {
      mockUserPermissions = [MIKPermissions.EVENTS_ADMIN]
      mockGetEventImageKey.mockResolvedValue(undefined)

      const response = await request(app).delete(`/api/v1/events/${sampleEvent.eventId}/image`)

      expect(response.status).toBe(404)
      expect(mockClearEventImage).not.toHaveBeenCalled()
    })
  })
})
