import 'dotenv/config'
import { randomFillSync } from 'crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import sharp from 'sharp'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router, processAttachmentImage } from '../../../src/routes/occurrences/api.ts'
import {
  OccurrenceCategory,
  type OccurrencesListResponse,
  type OccurrenceUpsert,
} from '@mik/contracts/occurrences'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { db } from '../../../src/db/connection.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/occurrences', router)
app.use(problemErrorHandler)

const processorToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'admin@mik.fi',
  roles: ['SMS_PROCESSOR'],
  permissions: [MIKPermissions.FLIGHTLOG_USER, MIKPermissions.SMS_PROCESSOR],
  canMakeReservations: false,
})

const managerToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'member@mik.fi',
  roles: ['SMS_MANAGER'],
  permissions: [MIKPermissions.FLIGHTLOG_USER, MIKPermissions.SMS_MANAGER],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Liisa1',
  lastName: 'Lahtinen',
  email: 'no-permissions@mik.fi',
  roles: ['MEMBER'],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const missingUserToken = generateAccessToken({
  memberId: 'Iceman99',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

beforeAll(() => {
  process.env.SMTP_LOGIN = 'no-reply@mik.fi'
  process.env.SMTP_PASSWORD = 'test'
  process.env.DISABLE_EMAIL_SENDING = 'true'
})

afterAll(() => {
  delete process.env.DISABLE_EMAIL_SENDING
})

afterEach(async () => {
  // Clean up test data
  await db
    .deleteFrom('flight.occurrence_attachments')
    .where('report_id', 'not like', 'SMS%')
    .execute()
  await db.deleteFrom('flight.occurrence_access').where('report_id', 'not like', 'SMS%').execute()
  await db.deleteFrom('flight.occurrences').where('report_id', 'not like', 'SMS%').execute()
})

describe('GET /occurrences', () => {
  const query = async (token: string, sudo = true) => {
    const response = await request(app)
      .get('/occurrences')
      .set('Cookie', `accessToken=${token}`)
      .set('X-Sudo', sudo ? 'true' : 'false')
      .query({})

    expect(response.status).toBe(200)

    return response.body as OccurrencesListResponse
  }

  it('should return new and unanonymized occurrences for sms independent processor', async () => {
    const { occurrences } = await query(processorToken, true)

    expect(
      occurrences.map(({ id, status, createdBy }) => ({
        id,
        status,
        createdBy,
      })),
    ).toEqual([
      {
        id: 'SMS1_NEW',
        status: 'NEW',
        createdBy: 'Matti1',
      },
      {
        id: 'SMS4_ANON',
        status: 'ANONYMIZING',
        createdBy: '-',
      },
    ])
  })

  it('should return own occurrences for admin without sudo', async () => {
    const { occurrences } = await query(processorToken, false)

    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      {
        id: 'SMS4_ANON',
        status: 'ANONYMIZING',
        createdBy: '-',
      },
    ])
  })

  it('should return anonymized occurences as a sms manager', async () => {
    const { occurrences } = await query(managerToken, true)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      { id: 'SMS2_ANON', status: 'ANONYMIZED', createdBy: '-' },
      {
        id: 'SMS3_CLOS',
        status: 'CLOSED',
        createdBy: '-',
      },
    ])
  })

  it('should return own occurences as a sms manager without sudo', async () => {
    const { occurrences } = await query(managerToken, false)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      { id: 'SMS1_NEW', status: 'NEW', createdBy: 'Matti1' },
      {
        id: 'SMS2_ANON',
        status: 'ANONYMIZED',
        createdBy: '-',
      },
      {
        id: 'SMS3_CLOS',
        status: 'CLOSED',
        createdBy: '-',
      },
    ])
  })

  it('should return own occurences as a user', async () => {
    const { occurrences } = await query(userToken)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      {
        id: 'SMS4_ANON',
        status: 'ANONYMIZING',
        createdBy: '-',
      },
    ])
  })

  it('should fail without flight log user permissions', async () => {
    const response = await request(app)
      .get('/occurrences')
      .set('Cookie', `accessToken=${missingUserToken}`)
      .query({})
    expect(response.status).toBe(403)
  })
})

const query = async (id: string, token: string, sudo = true) =>
  request(app)
    .get(`/occurrences/${id}`)
    .set('Cookie', `accessToken=${token}`)
    .set('X-Sudo', sudo ? 'true' : 'false')
    .query({})

describe('GET /occurrences/id', () => {
  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/occurrences/SMS3_CLOS').query({})

    expect(response.status).toBe(401)
  })
  it('Get return 401 if invalid token', async () => {
    const response = await query('SMS3_CLOS', 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Get return new occurrence as a sms processor', async () => {
    const response = await query('SMS1_NEW', processorToken)
    expect(response.status).toBe(200)
  })
  it('Get not show already received occurences for sms processor', async () => {
    const response = await query('SMS3_CLOS', processorToken)
    expect(response.status).toBe(404)
  })
  it('Get return anonymizing occurrence as a sms processor', async () => {
    const response = await query('SMS4_ANON', processorToken)
    expect(response.status).toBe(200)
  })

  it('Get return anonymized occurrence as a sms manager', async () => {
    const response = await query('SMS2_ANON', managerToken)
    expect(response.status).toBe(200)
  })

  it('Get not return new occurrence as a sms manager', async () => {
    const response = await query('SMS1_NEW', managerToken)
    expect(response.status).toBe(404)
  })

  it('Get return own occurrence as a regular user', async () => {
    const response = await query('SMS4_RECE', userToken)
    expect(response.status).toBe(200)
  })

  it('Get not return other user occurrences as a regular user', async () => {
    const response = await query('SMS1_NEW', userToken)
    expect(response.status).toBe(404)
  })

  it('Get return 404 as an admin with unknown role id', async () => {
    const response = await query('NOTFOUND', processorToken)
    expect(response.status).toBe(404)
  })
})

describe('PATCH /occurrences/id', () => {
  const patch = async (
    id: string,
    payload: Partial<OccurrenceUpsert>,
    token: string,
    sudo = true,
  ) =>
    request(app)
      .patch(`/occurrences/${id}`)
      .set('Cookie', `accessToken=${token}`)
      .set('X-Sudo', sudo ? 'true' : 'false')
      .send(payload)

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).patch('/occurrences/ADMIN').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await patch('ADMIN', {}, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Patch return 404 as independent processor with unknown role id', async () => {
    const response = await patch('NOTFOUND', {}, processorToken)
    expect(response.status).toBe(404)
  })
  it('Not patch the original new occurrence as a sms independent processor', async () => {
    const response = await patch('SMS1_NEW', {}, processorToken)
    expect(response.status).toBe(404)
  })
  it('Patch the anonymizing copy of the occurrence as a sms independent processor', async () => {
    const response = await patch('SMS4_ANON', {}, processorToken)
    expect(response.status).toBe(200)
  })
  it('Not patch already anonymized occurrence as a sms independent processor', async () => {
    const response = await patch('SMS2_ANON', {}, processorToken)
    expect(response.status).toBe(404)
  })

  it('Not patch new occurrence as a sms manager', async () => {
    const response = await patch('SMS1_NEW', {}, managerToken)
    expect(response.status).toBe(404)
  })
  it('Not patch anonymizing copy of the occurrence as a sms manager', async () => {
    const response = await patch('SMS4_ANON', {}, managerToken)
    expect(response.status).toBe(404)
  })
  it('Not patch anonymized occurrence as a sms manager', async () => {
    const response = await patch('SMS2_ANON', {}, managerToken)
    expect(response.status).toBe(404)
  })

  it('Patch own new occurrence as a sms manager without sudo', async () => {
    const response = await patch('SMS1_NEW', {}, managerToken, false)
    expect(response.status).toBe(200)
  })
  it('Not patch own received occurrence as a sms manager without sudo', async () => {
    const response = await patch('SMS3_CLOS', {}, managerToken, false)
    expect(response.status).toBe(404)
  })

  it('Not patch own anonymized occurrence as a regular user', async () => {
    const response = await patch('SMS3_CLOS', {}, userToken)
    expect(response.status).toBe(404)
  })
  it('Not patch occurrences of other users as a regular user', async () => {
    const response = await patch('SMS1_NEW', {}, userToken)
    expect(response.status).toBe(404)
  })
})

const post = async (path: string, data: object, token: string) =>
  request(app).post(`/occurrences${path}`).set('Cookie', `accessToken=${token}`).send(data)

const patch = async (id: string, data: object, token: string) =>
  request(app).patch(`/occurrences/${id}`).set('Cookie', `accessToken=${token}`).send(data)

const data = {
  occurrenceDate: new Date().toISOString(),
  headline: 'Test Occurrence',
  aircraftRegistration: 'OH-IHQ',
  aircraftTechnicalFault: null,
  categories: [OccurrenceCategory.BIRD],
  description: 'Test description',
  location: 'Test location',
  isWeatherRelevant: false,
  animalNumber: '0',
  animalSize: null,
  animalSpecies: null,
  arrivalAirport: 'EFHK',
  departureAirport: 'EFHK',
  isDtoReport: false,
} as OccurrenceUpsert

const expected = {
  ...data,
  status: 'NEW',
  id: expect.any(String),
  linkedReportId: null,
  reportDate: expect.any(String),
  access: [
    {
      accessId: expect.any(Number),
      at: expect.any(String),
      by: 'Liisa1',
      lastName: 'Korhonen',
      author: true,
      manage: true,
      memberId: 'Liisa1',
      roleId: null,
      write: true,
    },
    {
      accessId: expect.any(Number),
      at: expect.any(String),
      by: 'Liisa1',
      lastName: null,
      author: false,
      manage: true,
      memberId: null,
      roleId: 'SMS_PROCESSOR',
      write: false,
    },
  ],
  comments: [
    {
      at: expect.any(String),
      by: 'Author',
      status: 'NEW',
    },
  ],
  handling: {},
  attachments: [],
  createdAt: expect.any(String),
  createdBy: 'Liisa1',
  updatedAt: expect.any(String),
  updatedBy: 'Liisa1',
}
describe('POST /occurrences', () => {
  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).post('/occurrences').send({})

    expect(response.status).toEqual(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await post('/occurrences', {}, 'invalid_token')
    expect(response.status).toEqual(401)
  })

  it('Should create, update new occurrence as a member', async () => {
    const created = await post('', data, userToken)
    expect(created.status).toEqual(200)

    expect(created.body).toEqual({
      ...expected,
      // not returned when creating the occurrence
      access: expected.access.map((a) => ({ ...a, lastName: undefined })),
    })

    const updated = await patch(created.body.id, { animalNumber: '1' }, userToken)
    expect(updated.status).toEqual(200)
    expect(updated.body).toEqual({
      ...expected,
      animalNumber: '1',
    })

    const deleted = await post(`/${created.body.id}/status/DELETED`, {}, processorToken)
    expect(deleted.status).toEqual(200)
    expect(deleted.body).toEqual({
      ...expected,
      animalNumber: '1',
      status: 'DELETED',
      comments: [
        ...expected.comments,
        {
          at: expect.any(String),
          by: 'Lahtinen',
          status: 'DELETED',
        },
      ],
    })
  })
})

describe('POST /occurrences/status', () => {
  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).post('/occurrences/SMS1_NEW/status/DELETED').send({})

    expect(response.status).toEqual(401)
  })

  describe('POST /occurrences/:reportId/camo', () => {
    const createEligibleAnonymizedOccurrence = async () => {
      const created = await post('', { ...data, aircraftTechnicalFault: true }, userToken)
      expect(created.status).toEqual(200)

      const originalId = created.body.id as string
      const received = await post(`/${originalId}/status/RECEIVED`, {}, processorToken)
      expect(received.status).toEqual(200)

      const anonymizingId = received.body.id as string
      const anonymized = await post(`/${anonymizingId}/status/ANONYMIZED`, {}, processorToken)
      expect(anonymized.status).toEqual(200)

      return anonymized.body.id as string
    }

    it('shares an eligible occurrence with CAMO', async () => {
      const reportId = await createEligibleAnonymizedOccurrence()
      const response = await post(`/${reportId}/camo`, {}, managerToken)

      expect(response.status).toEqual(200)
      expect(response.body.access).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            roleId: 'CAMO',
            write: true,
            manage: false,
            author: false,
          }),
        ]),
      )
    })

    it('returns 409 when occurrence has already been shared with CAMO', async () => {
      const reportId = await createEligibleAnonymizedOccurrence()

      const firstResponse = await post(`/${reportId}/camo`, {}, managerToken)
      expect(firstResponse.status).toEqual(200)

      const secondResponse = await post(`/${reportId}/camo`, {}, managerToken)
      expect(secondResponse.status).toEqual(409)
      expect(secondResponse.body).toEqual({
        detail: 'Report has already been shared with CAMO',
        instance: `/occurrences/${reportId}/camo`,
        status: 409,
        timestamp: expect.any(String),
        title: 'Conflict',
      })
    })
  })
  it('Return 401 if invalid token', async () => {
    const response = await post('/occurrences/SMS1_NEW/status/DELETED', {}, 'invalid_token')
    expect(response.status).toEqual(401)
  })

  it('Return 403 if trying to delete occurrence as regular user', async () => {
    const response = await post('/SMS1_NEW/status/DELETED', {}, userToken)
    console.log(response.body)
    expect(response.status).toEqual(403)
    expect(response.body).toEqual({
      detail: 'Protected Content',
      instance: '/occurrences/SMS1_NEW/status/DELETED',
      status: 403,
      timestamp: expect.any(String),
      title: 'Forbidden',
    })
  })

  it('Return 403 if trying to receive occurrence as regular user', async () => {
    const response = await post('/SMS1_NEW/status/RECEIVED', {}, userToken)
    expect(response.status).toEqual(403)
    expect(response.body).toEqual({
      detail: 'Protected Content',
      instance: '/occurrences/SMS1_NEW/status/RECEIVED',
      status: 403,
      timestamp: expect.any(String),
      title: 'Forbidden',
    })
  })

  it('Return 404 if trying to receive occurence as sms manager', async () => {
    const response = await post('/SMS1_NEW/status/RECEIVED', {}, managerToken)
    expect(response.status).toEqual(404)
    expect(response.body).toEqual({
      detail: 'Report not found',
      instance: '/occurrences/SMS1_NEW/status/RECEIVED',
      status: 404,
      timestamp: expect.any(String),
      title: 'Not Found',
    })
  })

  it('Return 400 if trying to authorize new occurence as sms processor', async () => {
    const response = await post('/SMS1_NEW/status/AUTHORIZED', {}, processorToken)
    expect(response.status).toEqual(400)
    expect(response.body).toEqual({
      detail: 'Invalid status transition, from NEW to AUTHORIZED',
      instance: '/occurrences/SMS1_NEW/status/AUTHORIZED',
      status: 400,
      timestamp: expect.any(String),
      title: 'Bad Request',
    })
  })

  it('Return 400 if trying to delete anonymized occurence as sms manager', async () => {
    const response = await post('/SMS2_ANON/status/DELETED', {}, managerToken)
    expect(response.status).toEqual(400)
    expect(response.body).toEqual({
      detail: 'Invalid status transition, from ANONYMIZED to DELETED',
      instance: '/occurrences/SMS2_ANON/status/DELETED',
      status: 400,
      timestamp: expect.any(String),
      title: 'Bad Request',
    })
  })

  it('Should process occurrence full flow', async () => {
    const created = await post('', data, userToken)
    expect(created.status).toEqual(200)

    const originalId = created.body.id

    expect(created.body).toEqual({
      ...expected,
      access: expected.access.map((a) => ({ ...a, lastName: undefined })),
    })
    expect((await query(originalId, userToken)).body).toEqual(expected)
    expect((await query(originalId, processorToken)).body).toEqual(expected)
    expect((await query(originalId, managerToken)).status).toEqual(404)

    const expectedAnonymizingCopy = {
      ...expected,
      linkedReportId: originalId,
      status: 'ANONYMIZING',
      access: [
        {
          ...expected.access[0],
          manage: false,
          write: false,
          lastName: 'Author',
          memberId: '-',
        },
        {
          ...expected.access[1],
          lastName: null,
          write: true,
        },
      ],
      comments: [
        ...expected.comments,
        {
          at: expect.any(String),
          by: 'Lahtinen',
          status: 'ANONYMIZING',
        },
      ],
      createdBy: '-',
    }

    const received = await post(`/${created.body.id}/status/RECEIVED`, {}, processorToken)
    expect(received.status).toEqual(200)
    expect(received.body).toEqual({
      ...expectedAnonymizingCopy,
      access: [
        expectedAnonymizingCopy.access[0],
        { ...expectedAnonymizingCopy.access[1], lastName: undefined },
      ],
    })

    const anonymizedId = received.body.id

    const expectedReceived = {
      ...expected,
      linkedReportId: anonymizedId,
      status: 'RECEIVED',
      access: [
        {
          ...expected.access[0],
          manage: false,
          write: false,
        },
        {
          ...expected.access[1],
          lastName: null,
          manage: false,
        },
      ],
      comments: [
        ...expected.comments,
        {
          at: expect.any(String),
          by: 'Lahtinen',
          status: 'RECEIVED',
        },
      ],
    }

    expect((await query(originalId, userToken)).body).toEqual(expectedReceived)
    expect((await query(originalId, processorToken)).body).toEqual(expectedReceived)
    expect((await query(originalId, managerToken)).status).toEqual(404)

    expect((await query(anonymizedId, userToken)).body).toEqual(expectedAnonymizingCopy)
    expect((await query(anonymizedId, processorToken)).body).toEqual(expectedAnonymizingCopy)
    expect((await query(anonymizedId, managerToken)).status).toEqual(404)

    const expectedAnonymized = {
      ...expectedAnonymizingCopy,
      status: 'ANONYMIZED',
      access: [
        {
          ...expectedAnonymizingCopy.access[0],
        },
        {
          ...expectedAnonymizingCopy.access[1],
          lastName: null,
          roleId: 'SMS_MANAGER',
        },
      ],
      comments: [
        ...expectedAnonymizingCopy.comments,
        {
          at: expect.any(String),
          by: 'Lahtinen',
          status: 'ANONYMIZED',
        },
      ],
    }

    const anonymized = await post(`/${anonymizedId}/status/ANONYMIZED`, {}, processorToken)
    expect(anonymized.status).toEqual(200)
    expect(anonymized.body).toEqual({
      ...expectedAnonymized,
      access: [
        expectedAnonymized.access[0],
        { ...expectedAnonymized.access[1], lastName: undefined },
      ],
    })
    expect((await query(anonymizedId, userToken)).body).toEqual(expectedAnonymized)
    expect((await query(anonymizedId, processorToken)).status).toEqual(404)
    expect((await query(anonymizedId, managerToken)).body).toEqual(expectedAnonymized)

    const expectedProcessed = {
      ...expectedAnonymized,
      status: 'PROCESSED',
      comments: [
        ...expectedAnonymized.comments,
        {
          at: expect.any(String),
          by: 'Virtanen',
          status: 'PROCESSED',
        },
      ],
      handling: {
        processed: {
          adversity: 5,
          probability: 5,
          forwardedToTraficom: true,
          at: expect.any(String),
          by: 'Virtanen',
        },
      },
      updatedBy: 'Matti1',
    }

    const processed = await post(
      `/${anonymized.body.id}/status/PROCESSED`,
      {
        adversity: 5,
        probability: 5,
        forwardedToTraficom: true,
      },
      managerToken,
    )
    expect(processed.status).toEqual(200)
    expect(processed.body).toEqual(expectedProcessed)

    expect((await query(anonymizedId, userToken)).body).toEqual(expectedProcessed)
    expect((await query(anonymizedId, processorToken)).status).toEqual(404)
    expect((await query(anonymizedId, managerToken)).body).toEqual(expectedProcessed)

    const expectedClosed = {
      ...expectedProcessed,
      status: 'CLOSED',
      comments: [
        ...expectedProcessed.comments,
        {
          at: expect.any(String),
          by: 'Virtanen',
          status: 'CLOSED',
        },
      ],
      handling: {
        processed: {
          adversity: 5,
          probability: 5,
          forwardedToTraficom: true,
          at: expect.any(String),
          by: 'Virtanen',
        },
        closed: {
          adversity: 1,
          probability: 1,
          mitigatingAction: 'Fixed everything',
          at: expect.any(String),
          by: 'Virtanen',
        },
      },
    }

    const closed = await post(
      `/${anonymized.body.id}/status/CLOSED`,
      {
        adversity: 1,
        probability: 1,
        mitigatingAction: 'Fixed everything',
      },
      managerToken,
    )
    expect(closed.status).toEqual(200)
    expect(closed.body).toEqual(expectedClosed)

    expect((await query(anonymizedId, userToken)).body).toEqual(expectedClosed)
    expect((await query(anonymizedId, processorToken)).status).toEqual(404)
    expect((await query(anonymizedId, managerToken)).body).toEqual(expectedClosed)
  })
})

describe('Occurrence attachments', () => {
  const outsiderToken = generateAccessToken({
    memberId: 'Anna1',
    lastName: 'Heikkinen',
    email: 'outsider@mik.fi',
    roles: ['COMMITTEE'],
    permissions: [MIKPermissions.FLIGHTLOG_USER],
    canMakeReservations: false,
  })

  let jpegBuffer: Buffer
  let exifJpegBuffer: Buffer

  beforeAll(async () => {
    jpegBuffer = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .jpeg()
      .toBuffer()

    exifJpegBuffer = await sharp({
      create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Make: 'TestPhoneMaker', Model: 'TestPhoneModel' } })
      .jpeg()
      .toBuffer()
  })

  const uploadAttachment = (
    reportId: string,
    token: string,
    buffer: Buffer,
    filename = 'photo.jpg',
    mimetype = 'image/jpeg',
  ) =>
    request(app)
      .post(`/occurrences/${reportId}/attachments`)
      .set('Cookie', `accessToken=${token}`)
      .attach('file', buffer, { filename, contentType: mimetype })

  const deleteAttachment = (reportId: string, attachmentId: number, token: string) =>
    request(app)
      .delete(`/occurrences/${reportId}/attachments/${attachmentId}`)
      .set('Cookie', `accessToken=${token}`)

  const getAttachmentUrl = (reportId: string, attachmentId: number, token: string) =>
    request(app)
      .get(`/occurrences/${reportId}/attachments/${attachmentId}/url`)
      .set('Cookie', `accessToken=${token}`)

  describe('processAttachmentImage', () => {
    it('strips EXIF metadata and bakes in orientation', async () => {
      const sourceMeta = await sharp(exifJpegBuffer).metadata()
      expect(sourceMeta.exif).toBeDefined()
      expect(sourceMeta.orientation).toBe(6)

      const { buffer, mimeType } = await processAttachmentImage({
        buffer: exifJpegBuffer,
        originalname: 'IMG_selfie.jpg',
        mimetype: 'image/jpeg',
      } as unknown as Express.Multer.File)

      expect(mimeType).toBe('image/jpeg')
      const outMeta = await sharp(buffer).metadata()
      expect(outMeta.exif).toBeUndefined()
      expect([undefined, 1]).toContain(outMeta.orientation)
      // orientation 6 (rotate 90) is baked into the pixels, so width/height swap
      expect(outMeta.width).toBe(sourceMeta.height)
      expect(outMeta.height).toBe(sourceMeta.width)
    })
  })

  describe('POST /occurrences/:reportId/attachments', () => {
    it('lets the author upload to their own NEW report', async () => {
      const created = await post('', data, userToken)
      const reportId = created.body.id

      const response = await uploadAttachment(reportId, userToken, jpegBuffer)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        attachmentId: expect.any(Number),
        fileName: expect.stringMatching(/\.jpg$/),
        mimeType: 'image/jpeg',
        fileSize: expect.any(Number),
        originStatus: 'NEW',
        at: expect.any(String),
        by: 'Lahtinen',
      })

      const fetched = await query(reportId, userToken)
      expect(fetched.body.attachments).toHaveLength(1)
    })

    it('rejects upload from a member without access to the report', async () => {
      const created = await post('', data, userToken)
      const response = await uploadAttachment(created.body.id, outsiderToken, jpegBuffer)
      expect(response.status).toBe(404)
    })

    it('rejects upload once the report is deleted', async () => {
      const created = await post('', data, userToken)
      await post(`/${created.body.id}/status/DELETED`, {}, processorToken)

      const response = await uploadAttachment(created.body.id, userToken, jpegBuffer)
      expect(response.status).toBe(404)
    })

    it('rejects a 6th attachment', async () => {
      const created = await post('', data, userToken)
      const reportId = created.body.id
      for (let i = 0; i < 5; i++) {
        const res = await uploadAttachment(reportId, userToken, jpegBuffer)
        expect(res.status).toBe(200)
      }
      const sixth = await uploadAttachment(reportId, userToken, jpegBuffer)
      expect(sixth.status).toBe(400)
    })

    it('rejects non-image uploads', async () => {
      const created = await post('', data, userToken)
      const response = await uploadAttachment(
        created.body.id,
        userToken,
        Buffer.from('not an image'),
        'notes.txt',
        'text/plain',
      )
      expect(response.status).toBe(500)
    })

    it('rejects uploads over the raw size ceiling with a clean 400, not a 500', async () => {
      // Issue #1075: the raw multer cap was raised (10MB -> 40MB) so real phone photos
      // aren't rejected before compression gets a chance to run, and MulterError is now
      // mapped to a 400 by the central error handler instead of falling through to a
      // generic 500 with no useful detail.
      const created = await post('', data, userToken)
      const oversized = Buffer.alloc(41 * 1024 * 1024)
      const response = await uploadAttachment(created.body.id, userToken, oversized)
      expect(response.status).toBe(400)
      expect(response.body.detail).toMatch(/too large/i)
    })

    it('accepts a real photo above the old 10MB cap and compresses it', async () => {
      // Regression test for the actual reported bug: a real (valid) photo just over the
      // old 10MB raw limit must now succeed instead of being rejected before sharp ever
      // ran on it. Random pixel noise is close to worst-case for JPEG compression, so a
      // large-enough noisy image reliably produces a multi-megabyte file.
      const width = 4500
      const height = 3500
      const raw = randomFillSync(Buffer.alloc(width * height * 3))
      const largePhoto = await sharp(raw, { raw: { width, height, channels: 3 } })
        .jpeg({ quality: 100 })
        .toBuffer()
      expect(largePhoto.length).toBeGreaterThan(10 * 1024 * 1024)

      const created = await post('', data, userToken)
      const response = await uploadAttachment(created.body.id, userToken, largePhoto)
      expect(response.status).toBe(200)
      expect(response.body.fileSize).toBeLessThanOrEqual(1024 * 1024)
    }, 15000)
  })

  describe('Attachment visibility', () => {
    it('hides attachments from a member with only sharing-card access', async () => {
      const created = await post('', data, userToken)
      const reportId = created.body.id
      await uploadAttachment(reportId, userToken, jpegBuffer)

      await request(app)
        .post(`/occurrences/${reportId}/access`)
        .set('Cookie', `accessToken=${userToken}`)
        .send({ memberId: 'Anna1', author: false, write: false, manage: false })

      const asOutsider = await query(reportId, outsiderToken)
      expect(asOutsider.status).toBe(200)
      expect(asOutsider.body.attachments).toEqual([])

      const asAuthor = await query(reportId, userToken)
      expect(asAuthor.body.attachments).toHaveLength(1)
    })

    it('enforces the same visibility rule on the presigned URL endpoint', async () => {
      const created = await post('', data, userToken)
      const reportId = created.body.id
      const uploaded = await uploadAttachment(reportId, userToken, jpegBuffer)
      const attachmentId = uploaded.body.attachmentId

      const forbidden = await getAttachmentUrl(reportId, attachmentId, outsiderToken)
      expect(forbidden.status).toBe(404)

      const allowed = await getAttachmentUrl(reportId, attachmentId, userToken)
      expect(allowed.status).toBe(200)
      expect(allowed.body.url).toEqual(expect.any(String))
    })
  })

  describe('Clone isolation through the RECEIVED transition', () => {
    it('copies attachments to the anonymizing report without touching the original', async () => {
      const created = await post('', data, userToken)
      const reportId = created.body.id
      const uploaded = await uploadAttachment(reportId, userToken, jpegBuffer)
      expect(uploaded.status).toBe(200)

      const received = await post(`/${reportId}/status/RECEIVED`, {}, processorToken)
      expect(received.status).toBe(200)
      expect(received.body.attachments).toHaveLength(1)
      expect(received.body.attachments[0]).toEqual({
        attachmentId: expect.any(Number),
        fileName: uploaded.body.fileName,
        mimeType: 'image/jpeg',
        fileSize: uploaded.body.fileSize,
        // provenance is preserved: this copy still shows it came from the original report
        originStatus: 'NEW',
        at: expect.any(String),
        by: 'Korhonen',
      })
      // the copy is a distinct attachment row, not a reference to the original
      expect(received.body.attachments[0].attachmentId).not.toEqual(uploaded.body.attachmentId)

      const anonymizingId = received.body.id
      const copiedAttachmentId = received.body.attachments[0].attachmentId

      // the independent processor hides the picture on the anonymizing copy only
      const removed = await deleteAttachment(anonymizingId, copiedAttachmentId, processorToken)
      expect(removed.status).toBe(204)

      const anonymizingAfterDelete = await query(anonymizingId, processorToken)
      expect(anonymizingAfterDelete.body.attachments).toEqual([])
      expect(anonymizingAfterDelete.body.comments.at(-1)).toEqual({
        at: expect.any(String),
        by: 'Lahtinen',
        status: null,
        comment: expect.stringContaining('Attachment removed'),
      })

      // the original report's attachment must survive untouched
      const originalAfterDelete = await query(reportId, processorToken)
      expect(originalAfterDelete.body.attachments).toHaveLength(1)
      expect(originalAfterDelete.body.attachments[0].attachmentId).toEqual(
        uploaded.body.attachmentId,
      )
    })
  })
})
