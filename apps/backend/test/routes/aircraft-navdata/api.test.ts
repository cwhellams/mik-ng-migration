import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { router } from '../../../src/routes/aircraft-navdata/api.ts'
import type { Navdata } from '@mik/contracts/aircraft-navdata'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/aircraft-navdata', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_ADMIN, MIKPermissions.AIRCRAFT_USER],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Matti1',
  lastName: 'Virtanen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_USER],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'na',
  lastName: 'Unknown',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [],
  canMakeReservations: false,
})

const TEST_REGISTRATION = 'OH-STL'

const newRecord = {
  aircraftRegistration: TEST_REGISTRATION,
  updaterMemberId: 'k1mnimda',
  updateDate: '2026-04-29',
  cycle: '2604',
  expires: '2026-05-03',
}

const cleanupTestNavdata = async () => {
  await db
    .deleteFrom('flight.aircraftNavdata')
    .where('cycle', 'like', '2604%')
    .where('aircraftRegistration', '=', TEST_REGISTRATION)
    .execute()
}

describe('GET /aircraft-navdata', () => {
  const query = async (token: string, params?: Record<string, string>) =>
    request(app)
      .get('/aircraft-navdata')
      .set('Cookie', `accessToken=${token}`)
      .query(params ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircraft-navdata')
      .set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 403 when user has no permissions', async () => {
    const response = await query(noPermissionsToken)
    expect(response.status).toBe(403)
  })

  it('should return records list when authenticated', async () => {
    const response = await query(userToken)
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.records)).toBe(true)
    expect(typeof response.body.total).toBe('number')
  })

  it('should filter records by aircraftRegistration', async () => {
    const createResponse = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newRecord)
    expect(createResponse.status).toBe(201)

    try {
      const response = await query(userToken, {
        aircraftRegistration: TEST_REGISTRATION,
      })
      expect(response.status).toBe(200)
      expect(Array.isArray(response.body.records)).toBe(true)
      response.body.records.forEach((record: Navdata) => {
        expect(record.aircraftRegistration).toBe(TEST_REGISTRATION)
      })
    } finally {
      await cleanupTestNavdata()
    }
  })
})

describe('GET /aircraft-navdata/:navdataId', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircraft-navdata/1')
      .set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 404 for non-existent record', async () => {
    const response = await request(app)
      .get('/aircraft-navdata/00000000-0000-7000-8000-000000000000')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(404)
  })

  it('should return record by ID', async () => {
    const createResponse = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newRecord)
    expect(createResponse.status).toBe(201)
    const navdataId = createResponse.body.navdataId

    try {
      const response = await request(app)
        .get(`/aircraft-navdata/${navdataId}`)
        .set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.navdataId).toBe(navdataId)
      expect(response.body.cycle).toBe(newRecord.cycle)
    } finally {
      await cleanupTestNavdata()
    }
  })
})

describe('POST /aircraft-navdata', () => {
  afterEach(cleanupTestNavdata)

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=INVALID`)
      .send(newRecord)

    expect(response.status).toBe(401)
  })

  it('should return 403 for non-admin user', async () => {
    const response = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${userToken}`)
      .send(newRecord)

    expect(response.status).toBe(403)
  })

  it('should create a navdata record when admin', async () => {
    const response = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newRecord)

    expect(response.status).toBe(201)
    expect(response.body.navdataId).toBeDefined()
    expect(response.body.aircraftRegistration).toBe(newRecord.aircraftRegistration)
    expect(response.body.cycle).toBe(newRecord.cycle)
    expect(response.body.expires).toBe(newRecord.expires)
    expect(response.body.updateDate).toBe(newRecord.updateDate)
    expect(response.body.updaterMemberId).toBe(newRecord.updaterMemberId)
    expect(response.body.updaterName).toBeDefined()
    expect(response.body.createdAt).toBeDefined()
    expect(response.body.createdBy).toBe('k1mnimda')
  })

  it('should return 400 for missing required fields', async () => {
    const response = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ aircraftRegistration: TEST_REGISTRATION })

    expect(response.status).toBe(400)
  })
})

describe('DELETE /aircraft-navdata/:navdataId', () => {
  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .delete('/aircraft-navdata/1')
      .set('Cookie', `accessToken=INVALID`)

    expect(response.status).toBe(401)
  })

  it('should return 403 for non-admin user', async () => {
    const response = await request(app)
      .delete('/aircraft-navdata/1')
      .set('Cookie', `accessToken=${userToken}`)

    expect(response.status).toBe(403)
  })

  it('should return 404 for non-existent record', async () => {
    const response = await request(app)
      .delete('/aircraft-navdata/00000000-0000-7000-8000-000000000000')
      .set('Cookie', `accessToken=${adminToken}`)

    expect(response.status).toBe(404)
  })

  it('should delete navdata record when admin', async () => {
    const createResponse = await request(app)
      .post('/aircraft-navdata')
      .set('Cookie', `accessToken=${adminToken}`)
      .send(newRecord)
    expect(createResponse.status).toBe(201)
    const navdataId = createResponse.body.navdataId

    const deleteResponse = await request(app)
      .delete(`/aircraft-navdata/${navdataId}`)
      .set('Cookie', `accessToken=${adminToken}`)

    expect(deleteResponse.status).toBe(204)

    // Verify deleted
    const getResponse = await request(app)
      .get(`/aircraft-navdata/${navdataId}`)
      .set('Cookie', `accessToken=${userToken}`)

    expect(getResponse.status).toBe(404)
  })
})
