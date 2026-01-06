import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  type FlightLog,
  type FlightLogUpsertRequest,
} from '../../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { flightPayload } from './fixtures.ts'
import { audit } from '../../util/helpers.ts'

const test_member_id = 'Matti1'
const test_member_id2 = 'Sanna1'
const admin_member_id = 'Matti1'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)
app.use(problemErrorHandler)

const mattiToken = generateAccessToken({
  memberId: test_member_id,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const jukkaToken = generateAccessToken({
  memberId: 'Jukka1',
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const sannaToken = generateAccessToken({
  memberId: test_member_id2,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  memberId: admin_member_id,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
})

describe('GET /flight-log', () => {
  it('should only return data for the logged in user when not admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)

    expect(response.body.logs).toHaveLength(2)
    expect(response.body.logs[0]).toMatchSnapshot()
  })

  it('should only return data for the logged in user when admin without sudo', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-sudo', 'false')
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(2)
  })

  it('should return all data for ac when user is admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(3)
    expect(response.body.logs).toMatchSnapshot()
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        billableMemberId: test_member_id,
      })

    expect(response.status).toBe(200)

    expect(response.body.logs[0]).toMatchSnapshot()
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
        startDate: '2025-03-01T00:00:00Z',
      })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(2)
    expect(response.body.logs[0]).toMatchSnapshot()
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
    expect(response.body.logs[0]).toMatchSnapshot()
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

describe('GET /flight-log/flightid', () => {
  it('should return flights for the logged in user when not admin', async () => {
    const response = await request(app)
      .get('/flight-log/mikify')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({})

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('should return 403 for the logged in user for other flights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({})

    expect(response.status).toBe(403)
  })

  it('should return 403 for admin without sudo rights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-sudo', 'false')
      .query({})

    expect(response.status).toBe(403)
  })

  it('should return flight for admin with sudo rights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({})

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: expect.any(String),
    })
  })

  it('should return 404 for unknown flight', async () => {
    const response = await request(app)
      .get('/flight-log/noup')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({})

    expect(response.status).toBe(404)
  })
})

describe('POST /flight-log', () => {
  test.each([
    ['Sanna1', false, sannaToken],
    ['Matti1', true, mattiToken],
    ['Pekka1', false, adminToken],
  ])(
    'should create a flight log with valid payload , return flight_id and be deleted using the returned id',
    async (memberId: string, isDtoFlight: boolean, token: string) => {
      const response = await request(app)
        .post('/flight-log')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...flightPayload,
          picMemberId: memberId,
        })

      expect(response.body.flight_id).toBeDefined()
      const id = response.body.flight_id
      expect(id).toHaveLength(9)
      expect(response.status).toBe(201)

      const checkPost = await request(app)
        .get(`/flight-log/${id}`)
        .set('Authorization', `Bearer ${token}`)
      expect(checkPost.status).toBe(200)

      const checkPostBody = checkPost.body as FlightLog
      if (token !== adminToken) {
        // billable member id should match logged in user
        expect(checkPostBody.billableMemberId).toBe(memberId)
      } else {
        // admin can set any billable member id
        expect(checkPostBody.billableMemberId).toBe(flightPayload.billableMemberId)
      }
      expect(checkPostBody.picMemberId).toBe(memberId)
      expect(checkPostBody.isDtoTrainingFlight).toBe(isDtoFlight)

      // Cleanup
      const delResponse = await request(app)
        .delete(`/flight-log/${id}`)
        .set('Authorization', `Bearer ${token}`)
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

  it('should return 400 for invalid flight times', async () => {
    const response = await request(app)
      .post('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send({ ...flightPayload, offBlockTimeEpoch: '0' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'too_big',
          inclusive: true,
          maximum: 3600,
          message: '3600',
          path: ['takeoffTimeEpoch'],
          type: 'bigint',
        },
      ],
    })
  })
})

describe('PATCH /flight-log/', () => {
  test.each([mattiToken, adminToken])(
    'should update a flight log when billable member matches token member or user has elevated role',
    async token => {
      const payload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
        billableMemberId: 'Antti1',
      }

      const patchResponse = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)

      const checkPatch = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)

      // patch returns the same as another get
      expect(patchResponse.status).toBe(200)
      expect(patchResponse.body).toEqual(checkPatch.body)

      expect(checkPatch.status).toBe(200)
      expect(checkPatch.body).toMatchSnapshot({
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      })

      const undoPayload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
        billableMemberId: 'Matti1',
      }
      const undoResponse = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)
        .send(undoPayload)

      const checkUndo = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Authorization', `Bearer ${token}`)

      expect(undoResponse.status).toBe(200)
      expect(undoResponse.body).toEqual(checkUndo.body)

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
      lastName: 'Test',
      email: 'test@mik.fi',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

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
  it('should return a 400 if trying to patch single flight time components to be invalid', async () => {
    const payload: Partial<FlightLogUpsertRequest> = {
      offBlockTimeEpoch: '0',
    }

    const response = await request(app)
      .patch('/flight-log/bLwnAstr0')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/bLwnAstr0',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'too_big',
          inclusive: true,
          maximum: 3600,
          message: '3600',
          path: ['takeoffTimeEpoch'],
          type: 'bigint',
        },
      ],
    })
  })

  it('should prevent member updating admin only fields', async () => {
    const original = (
      await request(app).get('/flight-log/bLwnAstr0').set('Authorization', `Bearer ${mattiToken}`)
    ).body

    const patchResponse = await request(app)
      .patch('/flight-log/bLwnAstr0')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send({
        ajlbBlankRowsBefore: 999,
        ajlbSeqNo: 999,
        billableMemberId: 'NOT-ME',
        isBillableFlight: false,
        nonBillingReason: 'NOT-ME',
      })

    expect(patchResponse.status).toBe(200)
    expect(patchResponse.body).toEqual({
      ...original,
      ...audit('Matti1'),
    })

    const checkPatch = await request(app)
      .get('/flight-log/bLwnAstr0')
      .set('Authorization', `Bearer ${mattiToken}`)

    // patch returns the same as another get
    expect(checkPatch.status).toBe(200)
    expect(checkPatch.body).toEqual(patchResponse.body)
  })

  const updateAndRevertFlight = async (
    token: string,
    userId: string,
    flightId: string,
    validPatch: Partial<FlightLogUpsertRequest>,
  ) => {
    const original = (
      await request(app).get(`/flight-log/${flightId}`).set('Authorization', `Bearer ${token}`)
    ).body

    const patchResponse = await request(app)
      .patch(`/flight-log/${flightId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(flightPayload)

    expect(patchResponse.status).toBe(200)
    expect(patchResponse.body).toEqual({
      ...original,
      ...audit(userId),
      ...validPatch,
    })

    const checkPatch = await request(app)
      .get(`/flight-log/${flightId}`)
      .set('Authorization', `Bearer ${token}`)

    // patch returns the same as another get
    expect(checkPatch.status).toBe(200)
    expect(checkPatch.body).toEqual(patchResponse.body)

    const undoResponse = await request(app)
      .patch(`/flight-log/${flightId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(original)

    const checkUndo = await request(app)
      .get(`/flight-log/${flightId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(undoResponse.status).toBe(200)
    expect(undoResponse.body).toEqual(checkUndo.body)

    expect(checkUndo.status).toBe(200)
    expect(checkUndo.body).toEqual({
      ...original,
      ...audit(userId),
    })
  }

  it('should lock fields for admin after flight is validated', async () =>
    updateAndRevertFlight(adminToken, 'Matti1', 'da40tndra', {
      billableMemberId: flightPayload.billableMemberId,
      billingRemarks: flightPayload.billingRemarks,
      isBillableFlight: flightPayload.isBillableFlight,
      nonBillingReason: flightPayload.nonBillingReason,
      personalRemarks: flightPayload.personalRemarks,
    }))

  it('should lock fields for member after flight is validated', async () =>
    updateAndRevertFlight(jukkaToken, 'Jukka1', 'da40tndra', {
      billingRemarks: flightPayload.billingRemarks,
      personalRemarks: flightPayload.personalRemarks,
    }))

  it('should lock fields for admin after flight is billed', async () =>
    updateAndRevertFlight(adminToken, 'Matti1', 'efnu4evr', {
      personalRemarks: flightPayload.personalRemarks,
    }))

  it('should lock fields for member after flight is billed', async () =>
    updateAndRevertFlight(jukkaToken, 'Jukka1', 'efnu4evr', {
      personalRemarks: flightPayload.personalRemarks,
    }))
})

describe('POST /flight-log/validate', () => {
  it('should return a 401 if an invalid JWT token is passed', async () => {
    const invalidToken = 'THIS WILL NOT WORK'

    const response = await request(app)
      .post('/flight-log/efnu4evr/validate')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send()

    expect(response.status).toBe(401)
  })
  it('should return a 403 if billable members tries to validate his own flight', async () => {
    const response = await request(app)
      .post('/flight-log/mikify/validate')
      .set('Authorization', `Bearer ${mattiToken}`)
      .send()

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/flight-log/mikify/validate',
      timestamp: expect.any(String),
    })
  })
  it('should return a 404 if flight is not found', async () => {
    const response = await request(app)
      .post('/flight-log/noup/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()

    expect(response.body).toEqual({
      status: 404,
      title: 'Not Found',
      instance: '/flight-log/noup/validate',
      timestamp: expect.any(String),
      detail: 'Flight log not found',
    })
  })

  it('should return a 400 if flight is already billed', async () => {
    const response = await request(app)
      .post('/flight-log/da40tndra/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/da40tndra/validate',
      timestamp: expect.any(String),
      detail: 'Flight log status VALIDATED',
    })
  })

  it('should return a 400 if there are earlier unvalidated flights', async () => {
    const response = await request(app)
      .post('/flight-log/mass194/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/mass194/validate',
      timestamp: expect.any(String),
      detail: 'All previous flights must be first validated, validate mass193 first',
    })
  })

  it('should return a 400 if there are later validated flights', async () => {
    const response = await request(app)
      .post('/flight-log/mass100/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ revert: true })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/mass100/validate',
      timestamp: expect.any(String),
      detail: 'All later flights must be first reverted, revert mass192 first',
    })
  })

  it('should validate and revert the first new flight', async () => {
    const response = await request(app)
      .post('/flight-log/mass193/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()

    expect(response.status).toEqual(200)
    expect(response.body.acTotalFlightTime).toEqual('338:16')
    expect(response.body.ajlbPageNo).toEqual(33)
    expect(response.body.ajlbRowNo).toEqual(1)
    expect(response.body.status).toEqual('VALIDATED')

    const revert = await request(app)
      .post('/flight-log/mass193/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ revert: true })
    expect(revert.status).toEqual(200)
    expect(revert.body.acTotalFlightTime).toEqual('338:16')
    expect(revert.body.ajlbPageNo).toEqual(33)
    expect(revert.body.ajlbRowNo).toEqual(1)
    expect(revert.body.status).toEqual('NEW')
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
      lastName: 'Test',
      email: 'invalid@mik.fi',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    const response = await request(app)
      .delete('/flight-log/da40tndra')
      .set('Authorization', `Bearer ${delToken}`)

    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Flight log not owned by user or user has no admin rights',
      instance: '/flight-log/da40tndra',
      timestamp: expect.any(String),
    })
  })

  it('should return 400 when flight has been validated', async () => {
    const response = await request(app)
      .delete('/flight-log/da40tndra')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: 'Flight log in status VALIDATED and cannot be deleted',
      instance: '/flight-log/da40tndra',
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
    expect(response.body[1]).toMatchSnapshot()
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

describe('GET /flight-log/stats', () => {
  it('should return 403 with no permissions', async () => {
    const token = generateAccessToken({
      memberId: 'simplbks',
      lastName: 'Depp',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [],
    })

    const response = await request(app)
      .get('/flight-log/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(403)
  })

  it('should return 200 with no flights', async () => {
    const token = generateAccessToken({
      memberId: 'simplbks',
      lastName: 'Depp',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    const response = await request(app)
      .get('/flight-log/stats')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      stats: [],
    })
  })

  it('should return 200 with single plane', async () => {
    const response = await request(app)
      .get('/flight-log/stats')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      stats: [
        {
          aircraftRegistration: 'OH-STL',
          landings12month: 2,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'bLwnAstr0',
          lastTakeoffTimeUtc: '2025-03-03T10:30:00.000Z',
          time12month: 195,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 195,
          totalFlights: 2,
          totalLandings: 2,
        },
      ],
    })
  })

  it('should return 200 with multiple planes', async () => {
    const response = await request(app)
      .get('/flight-log/stats')
      .set('Authorization', `Bearer ${jukkaToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      stats: [
        {
          aircraftRegistration: 'OH-IHQ',
          landings12month: 2,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'efnu4evr',
          lastTakeoffTimeUtc: '2025-03-02T09:20:00.000Z',
          time12month: 120,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 120,
          totalFlights: 1,
          totalLandings: 2,
        },
        {
          aircraftRegistration: 'OH-P28',
          landings12month: 3,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'da40tndra',
          lastTakeoffTimeUtc: '2025-03-04T11:30:00.000Z',
          time12month: 110,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 110,
          totalFlights: 1,
          totalLandings: 3,
        },
        {
          aircraftRegistration: 'total',
          landings12month: 5,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'da40tndra',
          lastTakeoffTimeUtc: '2025-03-04T11:30:00.000Z',
          time12month: 230,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 230,
          totalLandings: 5,
        },
      ],
    })
  })
})
