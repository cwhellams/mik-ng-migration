import 'dotenv/config'
import { jest } from '@jest/globals'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { router } from '../../../src/routes/aircrafts/api.ts'
import {
  type Aircraft,
  type AircraftListResponse,
  type FuelTypesListResponse,
} from '../../../src/routes/aircrafts/models.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import type { Upsert } from '../../../src/types/schema.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/aircrafts', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.AIRCRAFT_ADMIN],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'user',
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

const removeTimestamps = (aircraft: Aircraft) => ({
  ...aircraft,
  createdAt: expect.any(String),
  updatedAt: expect.any(String),
  documents: aircraft.documents.map((doc) => ({
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
      .set('Cookie', `accessToken=${token}`)
      .set('X-Sudo', sudo ? 'true' : 'false')
      .query(query ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircrafts')
      .set('Cookie', `accessToken=NOUP`)
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
      .set('Cookie', `accessToken=${token}`)
      .query(query ?? {})

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircrafts/OH-STL')
      .set('Cookie', `accessToken=NOUP`)
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
    fuelTypes: ['100LL'],
    active: true,
    hidden: false,
    maintenance: {
      maintenanceCycle: 100,
      lastMaintenanceDate: '2023-10-01',
      lastMaintenanceType: '100h',
      lastMaintenanceMins: 100 * 60,
      nextMaintenanceDate: null,
      nextMaintenanceType: '50h',
      nextMaintenanceMins: 150 * 60,
      totalPercentageHours: 5,
      reservedHours: 2,
    },
    notes: [],
    location: 'test',
    equipment: 'test',
    hourlyRateEur: 100,
    documents: [],
  }

  const post = async (token: string, payload: Upsert<Aircraft>) =>
    request(app).post('/aircrafts').set('Cookie', `accessToken=${token}`).send(payload)

  const patch = async (token: string, registration: string, payload: Partial<Aircraft>) =>
    request(app)
      .patch(`/aircrafts/${registration}`)
      .set('Cookie', `accessToken=${token}`)
      .send(payload)

  const remove = async (token: string, registration: string) =>
    request(app).delete(`/aircrafts/${registration}`).set('Cookie', `accessToken=${token}`).send({})

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

describe('GET /aircrafts/fuel-types', () => {
  const query = async (token: string) =>
    request(app).get('/aircrafts/fuel-types').set('Cookie', `accessToken=${token}`)

  it('should return 401 for invalid token', async () => {
    const response = await request(app)
      .get('/aircrafts/fuel-types')
      .set('Cookie', `accessToken=NOUP`)

    expect(response.status).toBe(401)
  })

  it('should return 403 for user without required roles', async () => {
    const response = await query(noPermissionsToken)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/aircrafts/fuel-types',
      timestamp: expect.any(String),
    })
  })

  it('should return all 8 fuel types for a user', async () => {
    const response = await query(userToken)

    expect(response.status).toBe(200)
    const body = response.body as FuelTypesListResponse
    expect(body.fuelTypes).toHaveLength(8)
    expect(body.fuelTypes.map((ft) => ft.name)).toEqual([
      'JET A',
      'JET A-1',
      'JP-8',
      '100LL',
      'MOGAS 98E5',
      'MOGAS 95E10',
      'EN228 SUPER',
      'EN228 SUPER PLUS',
    ])
    expect(body.fuelTypes.every((ft) => typeof ft.sortOrder === 'number')).toBe(true)
  })

  it('should return all 8 fuel types for an admin', async () => {
    const response = await query(adminToken)

    expect(response.status).toBe(200)
    const body = response.body as FuelTypesListResponse
    expect(body.fuelTypes).toHaveLength(8)
  })
})
