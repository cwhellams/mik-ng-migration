import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  type FlightLog,
  type FlightLogMemberRequest,
} from '../../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

const test_member_id = 'Matti1'
const test_member_id2 = 'Sanna1'
const admin_member_id = 'Pekka1'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)
app.use(problemErrorHandler)

const mattiToken = generateAccessToken({
  memberId: test_member_id,
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const sannaToken = generateAccessToken({
  memberId: test_member_id2,
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  memberId: admin_member_id,
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
})

describe('GET /flight-log', () => {
  it('should only return data for the logged in user when not admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)

    expect(response.body.logs[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('should return all data for ac when user is admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toMatchSnapshot([
      {
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        updatedBy: expect.any(String),
      },
      {
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        updatedBy: expect.any(String),
      },
      {
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        updatedBy: expect.any(String),
      },
    ])
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        billableMemberId: test_member_id,
      })

    expect(response.status).toBe(200)

    expect(response.body.logs[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('should return 400 for invalid member_id', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        billable_member_id2: null,
      })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'unrecognized_keys',
          keys: ['billable_member_id2'],
          message: "Unrecognized key(s) in object: 'billable_member_id2'",
          path: [],
        },
      ],
    })
  })

  it('should return 200 for Start Date with time offset', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        startDate: '2025-03-03T22:00:00Z',
      })

    expect(response.status).toBe(200)
    expect(response.body.logs[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('should return 400 for invalid startDate timezone', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        startDate: '2025-02-29',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch('Invalid date')
  })

  it('should return 400 for invalid startDate format', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        endDate: 'not-a-date',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch('Invalid date')
  })

  it('should allow query parameters to be optional', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body.logs[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/mikify')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('Get flight log with Id should return a 404 when now row is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/100')
      .set('Authorization', `Bearer ${mattiToken}`)
    expect(response.status).toBe(404)
    expect(response.body.detail).toMatch(/Flight log not found/)
  })
})

describe('POST /flight-log', () => {
  test.each([
    ['Sanna1', false, sannaToken],
    ['Matti1', true, mattiToken],
  ])(
    'should create a flight log with valid payload , return flight_id and be deleted using the returned id',
    async (memberId: string, isDtoFlight: boolean, token: string) => {
      const payload: FlightLogMemberRequest = {
        aircraftRegistration: 'OH-STL',
        arrivalAirport: 'EFHK',
        billableMemberId: test_member_id,
        billingRemarks: 'N/A',
        picMemberId: memberId,
        picRole: 'FI',
        departureAirport: 'EFHK',
        flightType: 'KOU',
        fuelUpliftLitres: 40,
        fuelRemainingLitres: 20,
        incidentOrObservations: 'N/A',
        nightFlyingMins: 20,
        numberOfLandings: 1,
        offBlockTimeEpoch: (new Date('2025-03-22T10:30:00Z').getTime() / 1000).toString(),
        takeoffTimeEpoch: (new Date('2025-03-22T10:45:00Z').getTime() / 1000).toString(),
        landingTimeEpoch: (new Date('2025-03-22T11:40:00Z').getTime() / 1000).toString(),
        onBlockTimeEpoch: (new Date('2025-03-22T11:45:00Z').getTime() / 1000).toString(),
        oilUpliftLitres: 0.2,
        personsOnBoard: 3,
        personalRemarks: 'N/A',
        totalTimeInService: 0.2,
        privOrComFlight: 'P',
        instrumentFlyingMins: 0,
      }

      const response = await request(app)
        .post('/flight-log')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)

      expect(response.body.flight_id).toBeDefined()
      const id = response.body.flight_id
      expect(id).toHaveLength(9)
      expect(response.status).toBe(201)

      const checkPost = await request(app)
        .get(`/flight-log/${id}`)
        .set('Authorization', `Bearer ${token}`)
      expect(checkPost.status).toBe(200)
      expect(checkPost.body.isDtoTrainingFlight).toBe(isDtoFlight)

      // Cleanup
      const delResponse = await request(app)
        .delete(`/flight-log/${id}`)
        .set('Authorization', `Bearer ${mattiToken}`)
        .set('Accept', 'application/json')
      expect(delResponse.status).toBe(204)
      expect(delResponse.body).toEqual({})
    },
  )

  it('should return 400 for invalid payload', async () => {
    const payload = {
      member_id: 'invalid_id',
      flight_date: 'invalid_date',
      // other fields with invalid data
    }

    const response = await request(app)
      .post('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch(/Required/)
  })

  it('should return 400 for missing required fields', async () => {
    const payload = {
      // missing required fields
    }

    const response = await request(app)
      .post('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch(/Required/)
  })
})

describe('PATCH /flight-log/', () => {
  test.each([
    ['Matti1', [MIKPermissions.FLIGHTLOG_ADMIN]],
    ['Kaisa1', [MIKPermissions.FLIGHTLOG_USER]],
  ])(
    'should update a flight log when billable member matches token member or user has elevated role, using %d and %s',
    async (memberId, permissions) => {
      const payload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
      }

      //Create a token with a member id that matches billable member id
      const token = generateAccessToken({
        memberId: memberId,
        email: 'valid@mik.fi',
        permissions: permissions,
      })

      const response = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
      expect(response.status).toBe(204)

      const checkPatch = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)

      expect(checkPatch.status).toBe(200)
      expect(checkPatch.body).toMatchSnapshot({
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      })

      const undoPayload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
      }
      const undoResponse = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)
        .send(undoPayload)

      expect(undoResponse.status).toBe(204)

      const checkUndo = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)

      expect(checkUndo.status).toBe(200)
      expect(checkUndo.body).toMatchSnapshot({
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      })
    },
  )
  it('should return a 401 if an invalid JWT token is passed', async () => {
    const payload: Partial<FlightLog> = {
      crew2MemberId: 'Liisa1',
    }

    const invalidToken = 'THIS WILL NOT WORK'

    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send(payload)

    expect(response.status).toBe(401)
  })
  it('should return a 403 if the billable member id does not match token ID for a USER', async () => {
    const payload: Partial<FlightLog> = {
      crew2MemberId: 'Liisa1',
    }

    const invalidToken = generateAccessToken({
      memberId: 'Liisa1', // billable_member_id
      email: 'test@mik.fi',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    // Create a token with a member id that matches billable member id
    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Flight log not owned by user or user has no admin rights',
      instance: '/flight-log/efnu4evr',
      timestamp: expect.any(String),
    })
  })
  it('should return a 400 if the payload is not valid', async () => {
    const payload = {
      this_is_invalid: 'invalid',
    }

    //Creaate a token with a member id that matches billable member id
    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/efnu4evr',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'unrecognized_keys',
          keys: ['this_is_invalid'],
          message: "Unrecognized key(s) in object: 'this_is_invalid'",
          path: [],
        },
      ],
    })
  })
})

describe('DELETE /flight-log', () => {
  it('should return 404 when flight does not exist', async () => {
    const response = await request(app)
      .delete('/flight-log/100')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(404)
  })

  it('should return 403 when user does not have rights to delete a flight log', async () => {
    const delToken = generateAccessToken({
      memberId: 'Iceman99',
      email: 'invalid@mik.fi',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    const response = await request(app)
      .delete('/flight-log/mikify')
      .set('Authorization', `Bearer ${delToken}`)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Flight log not owned by user or user has no admin rights',
      instance: '/flight-log/mikify',
      timestamp: expect.any(String),
    })
  })

  it('should return 400 when flight has been billed', async () => {
    const response = await request(app)
      .delete('/flight-log/mikify')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: 'Flight already billed and read-only',
      instance: '/flight-log/mikify',
      timestamp: expect.any(String),
    })
  })
})

describe('GET /flight-log/totals', () => {
  it('should return 200 with all ac totals', async () => {
    const response = await request(app)
      .get('/flight-log/totals')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body[0]).toMatchSnapshot()
  })

  it('should return 200 with valid registration', async () => {
    const response = await request(app)
      .get('/flight-log/OH-STL/totals')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body[0]).toMatchSnapshot()
  })

  it('should return 404 with invalid registration', async () => {
    const response = await request(app)
      .get('/flight-log/OH-ABC/totals')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(404)
  })
})
