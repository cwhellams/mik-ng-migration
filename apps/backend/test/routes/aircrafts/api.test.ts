import 'dotenv/config'
import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

import { router } from '../../../src/routes/aircrafts/api.ts'
import {
  FuelType,
  type Aircraft,
  type AircraftDocument,
  type AircraftListResponse,
} from '../../../src/routes/aircrafts/models.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type { Upsert } from '../../../src/types/schema.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/aircrafts', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.AIRCRAFT_ADMIN],
})

const userToken = generateAccessToken({
  memberId: 'user',
  email: 'user@mik.fi',
  permissions: [MIKPermissions.AIRCRAFT_USER],
})

const noPermissionsToken = generateAccessToken({
  memberId: 'na',
  email: 'no-permissions@mik.fi',
  permissions: [],
})

const removeTimestamps = (aircraft: Aircraft) => ({
  ...aircraft,
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
  documents: aircraft.documents.map(doc => ({
    ...doc,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  })),
})

// keep document expiration date consistent for snapshots
beforeEach(async () => {
  jest
    .useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    .setSystemTime(new Date('2025-06-07T06:00:00Z'))
})

afterEach(async () => {})

describe('GET /aircrafts', () => {
  const query = async (token: string, sudo = true) =>
    request(app)
      .get('/aircrafts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Sudo', sudo ? 'true' : 'false')
      .query(query ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircrafts')
      .set('Authorization', `Bearer NOUP`)
      .query({})

    expect(response.status).toBe(401)
  })

  it('should return 403 as user without required roles', async () => {
    const response = await query(noPermissionsToken)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/aircrafts',
      timestamp: expect.any(String),
    })
  })

  it('should return only active aircrafts as a user', async () => {
    const response = await query(userToken)
    expect(response.status).toBe(200)

    const list = response.body as AircraftListResponse
    expect(list.aircrafts).toMatchSnapshot(list.aircrafts.map(removeTimestamps))
  })

  it('should return only active aircrafts as a admin without sudo', async () => {
    const response = await query(adminToken, false)
    expect(response.status).toBe(200)

    const list = response.body as AircraftListResponse
    expect(list.aircrafts).toMatchSnapshot(list.aircrafts.map(removeTimestamps))
  })

  it('should return all aircrafts as an admin', async () => {
    const response = await query(adminToken)

    const list = response.body as AircraftListResponse
    expect(list.aircrafts).toMatchSnapshot(list.aircrafts.map(removeTimestamps))
  })
})

describe('GET /aircrafts/id', () => {
  const query = async (token: string, id: string) =>
    request(app)
      .get(`/aircrafts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .query(query ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircrafts/OH-STL')
      .set('Authorization', `Bearer NOUP`)
      .query({})

    expect(response.status).toBe(401)
  })

  it('should return 403 as user without required roles', async () => {
    const response = await query(noPermissionsToken, 'OH-STL')

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/aircrafts/OH-STL',
      timestamp: expect.any(String),
    })
  })

  it('Get aircraft with valid registration should return the aircraft', async () => {
    const response = await query(userToken, 'OH-STL')

    expect(response.status).toBe(200)

    const aircraft = response.body as Aircraft

    expect(aircraft).toMatchSnapshot(removeTimestamps(aircraft))
  })

  it('Get aircraft with nonexisting registration should return 404', async () => {
    const response = await query(userToken, 'OH-CTL')

    expect(response.body).toEqual({
      status: 404,
      title: 'Not Found',
      detail: 'Aircraft not found',
      instance: '/aircrafts/OH-CTL',
      timestamp: expect.any(String),
    })
  })
})

describe('Add and update aircrafts', () => {
  const aircraft: Upsert<Aircraft> = {
    registration: 'OH-TST',
    displayName: 'Test plane',
    model: 'Jest',
    manufacturer: 'Jest',
    yearOfManufacture: 2000,
    seats: 2,
    usableFuelLitres: 100,
    fuelTypes: [FuelType.AVGAS],
    active: true,
    maintenance: {
      maintenanceCycle: 100,
      lastMaintenanceDate: '2023-10-01',
      lastMaintenanceType: '100h',
      lastMaintenanceTach: 100,
      nextMaintenanceDate: null,
      nextMaintenanceType: '50h',
      nextMaintenanceTach: 150,
      totalPercentageHours: 5,
      usablePercentageHours: 3,
    },
    notes: [],
    location: 'test',
    equipment: 'test',
    hourlyRateEur: 100,
    documents: [],
  }

  const post = async (token: string, payload: Upsert<Aircraft>) =>
    request(app).post('/aircrafts').set('Authorization', `Bearer ${token}`).send(payload)

  const patch = async (token: string, registration: string, payload: Partial<Aircraft>) =>
    request(app)
      .patch(`/aircrafts/${registration}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

  const remove = async (token: string, registration: string) =>
    request(app)
      .delete(`/aircrafts/${registration}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

  it('should return 401 for invalid token', async () => {
    const response = await post('NOUP', aircraft)

    expect(response.status).toBe(401)
  })

  it('should return 403 as user without required roles', async () => {
    const response = await post(userToken, aircraft)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/aircrafts',
      timestamp: expect.any(String),
    })
  })

  it('Get aircraft with valid registration should return the aircraft', async () => {
    const response = await post(adminToken, aircraft)

    expect(response.status).toBe(200)

    const res = response.body as Aircraft
    expect(res).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const updated = await patch(adminToken, res.registration, {
      displayName: 'Test plane 2',
    })
    expect(updated.body).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const removed = await remove(adminToken, res.registration)
    expect(removed.status).toBe(204)
  })
})

describe('Add and update aircraft documents', () => {
  const doc: Upsert<AircraftDocument> = {
    documentId: 'TST',
    startDate: '2023-10-01',
    endDate: '2023-10-01',
    alertDaysBefore: 30,
    hardLimit: 0,
    softLimit: 7,
  }

  const post = async (token: string, payload: Upsert<AircraftDocument>) =>
    request(app)
      .post('/aircrafts/OH-STL/documents')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

  const patch = async (token: string, payload: Partial<AircraftDocument>) =>
    request(app)
      .patch(`/aircrafts/OH-STL/documents/${doc.documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

  const remove = async (token: string) =>
    request(app)
      .delete(`/aircrafts/OH-STL/documents/${doc.documentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

  it('should return 401 for invalid token', async () => {
    const response = await post('NOUP', doc)

    expect(response.status).toBe(401)
  })

  it('should return 403 as user without required roles', async () => {
    const response = await post(userToken, doc)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/aircrafts/OH-STL/documents',
      timestamp: expect.any(String),
    })
  })

  it('Add and update documents', async () => {
    const response = await post(adminToken, doc)

    expect(response.status).toBe(200)

    const res = response.body as Aircraft
    expect(res).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const updated = await patch(adminToken, {
      startDate: '2023-10-02',
    })
    expect(updated.body).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    const removed = await remove(adminToken)
    expect(removed.status).toBe(204)
  })
})
