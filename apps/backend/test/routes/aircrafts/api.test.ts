import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import { router } from '../../../src/routes/aircrafts/api.ts'
import type { Aircraft, AircraftListResponse } from '../../../src/routes/aircrafts/models.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/aircrafts', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'admin',
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

describe('GET /aircrafts', () => {
  const query = async (token: string) =>
    request(app)
      .get('/aircrafts')
      .set('Authorization', `Bearer ${token}`)
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
    expect(list.aircrafts).toMatchSnapshot(
      list.aircrafts.map(aircraft => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        documents: aircraft.documents.map(doc => ({
          ...doc,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })),
    )
  })

  it('should return all aircrafts as an admin', async () => {
    const response = await query(adminToken)

    const list = response.body as AircraftListResponse
    expect(list.aircrafts).toMatchSnapshot(
      list.aircrafts.map(aircraft => ({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        status: {
          ...aircraft.status,
          ...(aircraft.maintenance.nextMaintenanceDate
            ? {
                daysUntilNextMaintenance: expect.any(Number),
              }
            : {}),
        },
        documents: aircraft.documents.map(doc => ({
          ...doc,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        })),
      })),
    )
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

    expect(aircraft).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      documents: aircraft.documents.map(doc => ({
        ...doc,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })),
    })
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
