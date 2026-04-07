import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/occurrences/api.ts'
import {
  OccurrenceCategory,
  type OccurrencesListResponse,
  type OccurrenceUpsert,
} from '../../../src/routes/occurrences/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type { Upsert } from '../../../src/types/schema.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
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
    payload: Partial<Upsert<OccurrenceUpsert>>,
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
      access: expected.access.map(a => ({ ...a, lastName: undefined })),
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
      access: expected.access.map(a => ({ ...a, lastName: undefined })),
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
