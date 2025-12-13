import 'dotenv/config'
import express from 'express'
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
import dayjs from 'dayjs'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/occurrences', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'Liisa1',
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER, MIKPermissions.SMS_ADMIN],
})

const smsTeamToken = generateAccessToken({
  memberId: 'Matti1',
  email: 'member@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER, MIKPermissions.SMS_TEAM],
})

const userToken = generateAccessToken({
  memberId: 'Liisa1',
  email: 'no-permissions@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const missingUserToken = generateAccessToken({
  memberId: 'Iceman99',
  email: 'no-permissions@mik.fi',
  permissions: [],
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
    .deleteFrom('flight.occurrences')
    .where('report_id', 'like', 'MIK_%')
    .where('created_by', '>', dayjs().subtract(1, 'minute').toISOString())
    .execute()
})

describe('GET /occurrences', () => {
  const query = async (token: string, sudo = true) => {
    const response = await request(app)
      .get('/occurrences')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Sudo', sudo ? 'true' : 'false')
      .query({})

    expect(response.status).toBe(200)

    return response.body as OccurrencesListResponse
  }

  it('should return all occurrences for admin', async () => {
    const { occurrences } = await query(adminToken, true)

    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      {
        id: 'SMS100001',
        status: 'NEW',
        createdBy: 'Matti1',
      },
      {
        id: 'SMS100004',
        status: 'CLOSED',
        createdBy: 'Matti1',
      },
      {
        id: 'SMS100005',
        status: 'ANONYMIZING',
        createdBy: 'Liisa1',
      },
      {
        id: 'SMS100003',
        status: 'ANONYMIZED',
        createdBy: 'Liisa1',
      },
      {
        id: 'SMS100002',
        status: 'RECEIVED',
        createdBy: 'Matti1',
      },
    ])
  })

  it('should return own occurrences for admin without sudo', async () => {
    const { occurrences } = await query(adminToken, false)

    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      {
        id: 'SMS100005',
        status: 'ANONYMIZING',
        createdBy: 'Liisa1',
      },
      {
        id: 'SMS100003',
        status: 'ANONYMIZED',
        createdBy: 'Liisa1',
      },
    ])
  })

  it('should return anonymized occurences as a sms team member', async () => {
    const { occurrences } = await query(smsTeamToken, true)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      { id: 'SMS100004', status: 'CLOSED', createdBy: 'Matti1' },
      {
        id: 'SMS100003',
        status: 'ANONYMIZED',
        createdBy: 'Liisa1',
      },
    ])
  })

  it('should return own occurences as a sms team member without sudo', async () => {
    const { occurrences } = await query(smsTeamToken, false)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      { id: 'SMS100001', status: 'NEW', createdBy: 'Matti1' },
      {
        id: 'SMS100004',
        status: 'CLOSED',
        createdBy: 'Matti1',
      },
      {
        id: 'SMS100002',
        status: 'RECEIVED',
        createdBy: 'Matti1',
      },
    ])
  })

  it('should return own occurences as a user', async () => {
    const { occurrences } = await query(userToken)
    expect(occurrences.map(({ id, status, createdBy }) => ({ id, status, createdBy }))).toEqual([
      {
        id: 'SMS100005',
        status: 'ANONYMIZING',
        createdBy: 'Liisa1',
      },
      {
        id: 'SMS100003',
        status: 'ANONYMIZED',
        createdBy: 'Liisa1',
      },
    ])
  })

  it('should fail without flight log user permissions', async () => {
    const response = await request(app)
      .get('/occurrences')
      .set('Authorization', `Bearer ${missingUserToken}`)
      .query({})
    expect(response.status).toBe(403)
  })
})

describe('GET /occurrences/id', () => {
  const query = async (id: string, token: string) =>
    request(app).get(`/occurrences/${id}`).set('Authorization', `Bearer ${token}`).query({})

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).get('/occurrences/SMS100003').query({})

    expect(response.status).toBe(401)
  })
  it('Get return 401 if invalid token', async () => {
    const response = await query('SMS100003', 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Get return new occurrence as a sms admin', async () => {
    const response = await query('SMS100001', adminToken)
    expect(response.status).toBe(200)
  })

  it('Get return anonymized occurrence as a sms team member', async () => {
    const response = await query('SMS100004', smsTeamToken)
    expect(response.status).toBe(200)
  })

  it('Get not return new occurrence as a sms team member', async () => {
    const response = await query('SMS100001', smsTeamToken)
    expect(response.status).toBe(404)
  })

  it('Get return own occurrence as a regular user', async () => {
    const response = await query('SMS100003', userToken)
    expect(response.status).toBe(200)
  })

  it('Get not return other user occurrences as a regular user', async () => {
    const response = await query('SMS100001', userToken)
    expect(response.status).toBe(404)
  })

  it('Get return 404 as an admin with unknown role id', async () => {
    const response = await query('NOTFOUND', adminToken)
    expect(response.status).toBe(404)
  })
})

describe('PATCH /occurrences/id', () => {
  const patch = async (id: string, payload: Partial<Upsert<OccurrenceUpsert>>, token: string) =>
    request(app).patch(`/occurrences/${id}`).set('Authorization', `Bearer ${token}`).send(payload)

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).patch('/occurrences/ADMIN').send({})

    expect(response.status).toBe(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await patch('ADMIN', {}, 'invalid_token')
    expect(response.status).toBe(401)
  })

  it('Patch new occurrence as a sms admin', async () => {
    const response = await patch('SMS100001', {}, adminToken)
    expect(response.status).toBe(200)
  })

  it('Patch anonymized occurrence as a sms team member', async () => {
    const response = await patch('SMS100004', {}, smsTeamToken)
    expect(response.status).toBe(200)
  })

  it('Patch not return new occurrence as a sms team member', async () => {
    const response = await patch('SMS100001', {}, smsTeamToken)
    expect(response.status).toBe(404)
  })

  it('Patch return own occurrence as a regular user', async () => {
    const response = await patch('SMS100003', {}, userToken)
    expect(response.status).toBe(200)
  })

  it('Patch not return other user occurrences as a regular user', async () => {
    const response = await patch('SMS100001', {}, userToken)
    expect(response.status).toBe(404)
  })

  it('Patch return 404 as an admin with unknown role id', async () => {
    const response = await patch('NOTFOUND', {}, adminToken)
    expect(response.status).toBe(404)
  })
})

describe('POST /occurrences', () => {
  const data = {
    occurrenceDate: new Date().toISOString(),
    headline: 'Test Occurrence',
    aircraftRegistration: 'OH-IHQ',
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

  const post = async (path: string, data: object, token: string) =>
    request(app).post(`/occurrences${path}`).set('Authorization', `Bearer ${token}`).send(data)

  const patch = async (id: string, data: object, token: string) =>
    request(app).patch(`/occurrences/${id}`).set('Authorization', `Bearer ${token}`).send(data)

  it('Get return 401 if no token in authorization header', async () => {
    const response = await request(app).post('/occurrences').send({})

    expect(response.status).toEqual(401)
  })
  it('Return 401 if invalid token', async () => {
    const response = await post('', {}, 'invalid_token')
    expect(response.status).toEqual(401)
  })

  it('Return 403 if trying to delete occurrence as regular user', async () => {
    const response = await post('/SMS100001/DELETED', {}, userToken)
    expect(response.status).toEqual(403)
    expect(response.body).toEqual({
      detail: 'Protected Content',
      instance: '/occurrences/SMS100001/DELETED',
      status: 403,
      timestamp: expect.any(String),
      title: 'Forbidden',
    })
  })

  it('Return 403 if trying to receive occurrence as regular user', async () => {
    const response = await post('/SMS100001/RECEIVED', {}, userToken)
    expect(response.status).toEqual(403)
    expect(response.body).toEqual({
      detail: 'Protected Content',
      instance: '/occurrences/SMS100001/RECEIVED',
      status: 403,
      timestamp: expect.any(String),
      title: 'Forbidden',
    })
  })

  it('Return 404 if trying to receive occurence as sms team member', async () => {
    const response = await post('/SMS100001/RECEIVED', {}, smsTeamToken)
    expect(response.status).toEqual(404)
    expect(response.body).toEqual({
      detail: 'Report not found',
      instance: '/occurrences/SMS100001/RECEIVED',
      status: 404,
      timestamp: expect.any(String),
      title: 'Not Found',
    })
  })
  it('Return 400 if trying to authorize new occurence as admin', async () => {
    const response = await post('/SMS100001/AUTHORIZED', {}, adminToken)
    expect(response.status).toEqual(400)
    expect(response.body).toEqual({
      detail: 'Invalid status transition, from NEW to AUTHORIZED',
      instance: '/occurrences/SMS100001/AUTHORIZED',
      status: 400,
      timestamp: expect.any(String),
      title: 'Bad Request',
    })
  })

  it('Return 400 if trying to delete closed occurence as admin', async () => {
    const response = await post('/SMS100004/DELETED', {}, adminToken)
    expect(response.status).toEqual(400)
    expect(response.body).toEqual({
      detail: 'Invalid status transition, from CLOSED to DELETED',
      instance: '/occurrences/SMS100004/DELETED',
      status: 400,
      timestamp: expect.any(String),
      title: 'Bad Request',
    })
  })

  it('Should create, update and delete new occurrence', async () => {
    const created = await post('', data, userToken)
    expect(created.status).toEqual(200)

    const expected = {
      ...data,
      status: 'NEW',
      id: expect.any(String),
      linkedReportId: null,
      reportDate: expect.any(String),
      createdAt: expect.any(String),
      createdBy: 'Liisa1',
      updatedAt: expect.any(String),
      updatedBy: 'Liisa1',
    }

    expect(created.body).toEqual(expected)

    const updated = await patch(created.body.id, { animalNumber: '1' }, userToken)
    expect(updated.status).toEqual(200)
    expect(updated.body).toEqual({
      ...expected,
      animalNumber: '1',
    })

    const deleted = await post(`/${created.body.id}/DELETED`, {}, adminToken)
    expect(deleted.status).toEqual(200)
    expect(deleted.body).toEqual({
      ...expected,
      animalNumber: '1',
      status: 'DELETED',
    })
  })

  it('Should process occurrence full flow', async () => {
    const created = await post('', data, userToken)
    expect(created.status).toEqual(200)

    const expected = {
      ...data,
      status: 'NEW',
      id: expect.any(String),
      linkedReportId: null,
      reportDate: expect.any(String),
      createdAt: expect.any(String),
      createdBy: 'Liisa1',
      updatedAt: expect.any(String),
      updatedBy: 'Liisa1',
    }
    expect(created.body).toEqual(expected)

    const received = await post(`/${created.body.id}/RECEIVED`, {}, adminToken)
    expect(received.status).toEqual(200)
    expect(received.body).toEqual({
      ...expected,
      linkedReportId: created.body.id,
      status: 'ANONYMIZING',
    })

    const anonymized = await post(`/${received.body.id}/ANONYMIZED`, {}, adminToken)
    expect(anonymized.status).toEqual(200)
    expect(anonymized.body).toEqual({
      ...expected,
      linkedReportId: created.body.id,
      status: 'ANONYMIZED',
    })

    const closed = await post(`/${anonymized.body.id}/CLOSED`, {}, adminToken)
    expect(closed.status).toEqual(200)
    expect(closed.body).toEqual({
      ...expected,
      linkedReportId: created.body.id,
      status: 'CLOSED',
    })
  })
})
