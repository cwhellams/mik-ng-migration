import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { db } from '../../../src/db/connection.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  type FlightLog,
  FlightType,
  FlightLogStatus,
  type FlightLogUpsertRequest,
} from '../../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { flightPayload } from './fixtures.ts'
import { audit } from '../../util/helpers.ts'
import assert from 'node:assert/strict'

const test_member_id = 'Matti1'
const test_member_id2 = 'Sanna1'
const admin_member_id = 'Matti1'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/flight-log', flightLogRouter)
app.use(problemErrorHandler)

const mattiToken = generateAccessToken({
  memberId: test_member_id,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const jukkaToken = generateAccessToken({
  memberId: 'Jukka1',
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const sannaToken = generateAccessToken({
  memberId: test_member_id2,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_USER],
  canMakeReservations: false,
})

const adminToken = generateAccessToken({
  memberId: admin_member_id,
  lastName: 'Virtanen',
  email: 'jonny.depp@mik.fi',
  roles: [],
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
  canMakeReservations: false,
})

const maskLandingTotals = <T extends Record<string, unknown>>(row: T): T => ({
  ...row,
  acTotalLandings:
    typeof row.acTotalLandings === 'number' || row.acTotalLandings === null
      ? 0
      : row.acTotalLandings,
})

describe('GET /flight-log', () => {
  it('should only return data for the logged in user when not admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)

    expect(response.body.logs).toHaveLength(5)
    expect(maskLandingTotals(response.body.logs[0])).toMatchSnapshot()
  })

  it('should only return data for the logged in user when admin without sudo', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${adminToken}`)
      .set('x-sudo', 'false')
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(5)
  })

  it('should return all data for ac when user is admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(46)
    expect(response.body.logs.map(maskLandingTotals)).toMatchSnapshot()
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        billableMemberId: test_member_id,
      })

    expect(response.status).toBe(200)

    expect(maskLandingTotals(response.body.logs[0])).toMatchSnapshot()
  })

  it('should return 400 for invalid member_id', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        billable_member_id2: null,
      })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log',
      timestamp: expect.any(String),
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'unrecognized_keys',
          keys: ['billable_member_id2'],
          path: [],
        }),
      ]),
    })
  })

  it('should return 200 for Start Date with time offset', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        startDate: '2025-03-01T00:00:00Z',
      })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(17)
    expect(maskLandingTotals(response.body.logs[0])).toMatchSnapshot()
  })

  it('should return 400 for invalid startDate timezone', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        startDate: '2025-02-29',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch('Invalid ISO datetime')
  })

  it('should return 400 for invalid startDate format', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        endDate: 'not-a-date',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(response.body.errors[0].message).toMatch('Invalid ISO datetime')
  })

  it('should allow query parameters to be optional', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(200)
    expect(maskLandingTotals(response.body.logs[0])).toMatchSnapshot()
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/mikify')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body.acTotalLandings).toBeGreaterThan(0) // NEW flight: baseline + cumulative landings from view
    expect(maskLandingTotals(response.body)).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('Get flight log with Id should return a 404 when no row is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/100')
      .set('Cookie', `accessToken=${mattiToken}`)
    expect(response.status).toBe(404)
    expect(response.body.detail).toMatch(/Flight log not found/)
  })
})

describe('GET /flight-log/overlap-check', () => {
  // 'mikify' is a NEW OH-STL flight covering 1740816000 - 1740824100
  it('returns the conflicting entry for an overlapping interval', async () => {
    const response = await request(app)
      .get('/flight-log/overlap-check')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        aircraftRegistration: 'OH-STL',
        offBlockTimeEpoch: 1740819600,
        onBlockTimeEpoch: 1740822000,
      })

    expect(response.status).toBe(200)
    expect(response.body.conflicts).toHaveLength(1)
    expect(response.body.conflicts[0]).toEqual({
      flightId: 'mikify',
      aircraftRegistration: 'OH-STL',
      offBlockTimeUtc: expect.any(String),
      onBlockTimeUtc: expect.any(String),
      status: FlightLogStatus.NEW,
    })
  })

  it('excludes the flight being edited', async () => {
    const response = await request(app)
      .get('/flight-log/overlap-check')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        aircraftRegistration: 'OH-STL',
        offBlockTimeEpoch: 1740819600,
        onBlockTimeEpoch: 1740822000,
        excludeFlightId: 'mikify',
      })

    expect(response.status).toBe(200)
    expect(response.body.conflicts).toEqual([])
  })

  it('returns no conflicts for a free interval', async () => {
    const response = await request(app)
      .get('/flight-log/overlap-check')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        aircraftRegistration: 'OH-STL',
        offBlockTimeEpoch: 1740824100,
        onBlockTimeEpoch: 1740829800,
      })

    expect(response.status).toBe(200)
    expect(response.body.conflicts).toEqual([])
  })

  it('returns 400 when the interval is missing', async () => {
    const response = await request(app)
      .get('/flight-log/overlap-check')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({ aircraftRegistration: 'OH-STL' })

    expect(response.status).toBe(400)
  })
})

describe('GET /flight-log/flightid', () => {
  it('should return flights for the logged in user when not admin', async () => {
    const response = await request(app)
      .get('/flight-log/mikify')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({})

    expect(response.status).toBe(200)
    expect(maskLandingTotals(response.body)).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('should return 403 for the logged in user for other flights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({})

    expect(response.status).toBe(403)
  })

  it('should return 403 for admin without sudo rights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Cookie', `accessToken=${adminToken}`)
      .set('x-sudo', 'false')
      .query({})

    expect(response.status).toBe(403)
  })

  it('should return flight for admin with sudo rights', async () => {
    const response = await request(app)
      .get('/flight-log/efnu4evr')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({})

    expect(response.status).toBe(200)
    expect(maskLandingTotals(response.body)).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      updatedBy: expect.any(String),
    })
  })

  it('should return 404 for unknown flight', async () => {
    const response = await request(app)
      .get('/flight-log/noup')
      .set('Cookie', `accessToken=${mattiToken}`)
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
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`)
      expect(checkPost.status).toBe(200)

      const checkPostBody = checkPost.body as FlightLog
      if (token === adminToken) {
        // admin can set any billable member id
        expect(checkPostBody.billableMemberId).toBe(flightPayload.billableMemberId)
      } else {
        // billable member id should match logged in user
        expect(checkPostBody.billableMemberId).toBe(memberId)
      }
      expect(checkPostBody.picMemberId).toBe(memberId)
      expect(checkPostBody.isDtoTrainingFlight).toBe(isDtoFlight)

      // Cleanup
      const delResponse = await request(app)
        .delete(`/flight-log/${id}`)
        .set('Cookie', `accessToken=${token}`)
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
      .set('Cookie', `accessToken=${mattiToken}`)
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(
      response.body.errors.some((e: { message: string }) => /received undefined/.test(e.message)),
    ).toBe(true)
  })

  it('should return 400 for missing required fields', async () => {
    const payload = {
      // missing required fields
    }

    const response = await request(app)
      .post('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.errors).toBeDefined()
    expect(
      response.body.errors.some((e: { message: string }) => /received undefined/.test(e.message)),
    ).toBe(true)
  })

  it('should return 400 for invalid flight times', async () => {
    const response = await request(app)
      .post('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .send({ ...flightPayload, offBlockTimeEpoch: '0' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log',
      timestamp: expect.any(String),
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'too_big',
          inclusive: true,
          maximum: 3600,
          message: '3600',
          path: ['takeoffTimeEpoch'],
        }),
      ]),
    })
  })

  it('should return 400 when test flight is missing billing remarks', async () => {
    const response = await request(app)
      .post('/flight-log')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        ...flightPayload,
        flightType: FlightType.TEST_FLIGHT,
        billingRemarks: '   ',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['billingRemarks'],
          message: 'Billing remarks are required for test and ferry flights',
        }),
      ]),
    )
  })
})

describe('PATCH /flight-log/', () => {
  beforeEach(async () => {
    // Reset auto-set fields that updateFlightLog writes whenever isBillableFlight/entryErrorFee
    // appear in a patch — ensures a clean baseline before each test in this block.
    await db
      .updateTable('flight.logs')
      .set({
        non_billing_approved_by_member_id: null,
        entry_error_fee_applied_by_member_id: null,
      })
      .where('flight_id', '=', 'da40tndra')
      .execute()
  })

  test.each([mattiToken, adminToken])(
    'should update a flight log when billable member matches token member or user has elevated role',
    async (token) => {
      const payload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
        billableMemberId: 'Antti1',
      }

      const patchResponse = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Cookie', `accessToken=${token}`)
        .send(payload)

      const checkPatch = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Cookie', `accessToken=${token}`)

      // patch returns the same as another get
      expect(patchResponse.status).toBe(200)
      expect(patchResponse.body).toEqual(checkPatch.body)

      expect(checkPatch.status).toBe(200)
      expect(maskLandingTotals(checkPatch.body)).toMatchSnapshot({
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      })

      const undoPayload: Partial<FlightLog> = {
        crew2MemberId: 'Antti1',
        billableMemberId: 'Matti1',
      }
      const undoResponse = await request(app)
        .patch('/flight-log/bLwnAstr0')
        .set('Cookie', `accessToken=${token}`)
        .send(undoPayload)

      const checkUndo = await request(app)
        .get('/flight-log/bLwnAstr0')
        .set('Cookie', `accessToken=${token}`)

      expect(undoResponse.status).toBe(200)
      expect(undoResponse.body).toEqual(checkUndo.body)

      expect(checkUndo.status).toBe(200)
      expect(maskLandingTotals(checkUndo.body)).toMatchSnapshot({
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
      .set('Cookie', `accessToken=${invalidToken}`)
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
      canMakeReservations: false,
    })

    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Cookie', `accessToken=${invalidToken}`)
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
      .set('Cookie', `accessToken=${adminToken}`)
      .send(payload)

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/bLwnAstr0',
      timestamp: expect.any(String),
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'too_big',
          inclusive: true,
          maximum: 3600,
          message: '3600',
          path: ['takeoffTimeEpoch'],
        }),
      ]),
    })
  })

  it('should prevent member updating admin only fields', async () => {
    const original = (
      await request(app).get('/flight-log/bLwnAstr0').set('Cookie', `accessToken=${mattiToken}`)
    ).body

    const patchResponse = await request(app)
      .patch('/flight-log/bLwnAstr0')
      .set('Cookie', `accessToken=${mattiToken}`)
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
      .set('Cookie', `accessToken=${mattiToken}`)

    // patch returns the same as another get
    expect(checkPatch.status).toBe(200)
    expect(checkPatch.body).toEqual(patchResponse.body)
  })

  it('should return 400 when patch sets ferry flight without billing remarks', async () => {
    const response = await request(app)
      .patch('/flight-log/bLwnAstr0')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({
        flightType: FlightType.FERRY,
        billingRemarks: ' ',
      })

    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['billingRemarks'],
          message: 'Billing remarks are required for test and ferry flights',
        }),
      ]),
    )
  })

  //TODO: This test is brittle and should be replaced with more targeted tests for field locking based on flight status
  const updateAndRevertFlight = async (
    token: string,
    userId: string,
    flightId: string,
    validPatch: Partial<FlightLogUpsertRequest>,
  ) => {
    const original = (
      await request(app).get(`/flight-log/${flightId}`).set('Cookie', `accessToken=${token}`)
    ).body

    assert(original.nonBillingApprovedByMemberId == null)

    const patchResponse = await request(app)
      .patch(`/flight-log/${flightId}`)
      .set('Cookie', `accessToken=${token}`)
      .send(flightPayload)

    expect(patchResponse.status).toBe(200)

    expect(patchResponse.body).toEqual({
      ...original,
      ...audit(userId),
      ...validPatch,
    })

    assert(
      patchResponse.body.nonBillingApprovedByMemberId ===
        (validPatch.nonBillingApprovedByMemberId ?? null),
    )

    const checkPatch = await request(app)
      .get(`/flight-log/${flightId}`)
      .set('Cookie', `accessToken=${token}`)

    // patch returns the same as another get
    expect(checkPatch.status).toBe(200)
    expect(checkPatch.body).toEqual(patchResponse.body)

    const undoResponse = await request(app)
      .patch(`/flight-log/${flightId}`)
      .set('Cookie', `accessToken=${token}`)
      .send(original)

    expect(undoResponse.status).toBe(200)

    const checkUndo = await request(app)
      .get(`/flight-log/${flightId}`)
      .set('Cookie', `accessToken=${token}`)

    expect(undoResponse.status).toBe(200)
    expect(undoResponse.body).toEqual(checkUndo.body)

    expect(checkUndo.status).toBe(200)

    // expect(checkUndo.body).toEqual({
    //   ...original,
    //   ...audit(userId),
    // })
  }

  it('should lock fields for admin after flight is validated', async () =>
    updateAndRevertFlight(adminToken, 'Matti1', 'da40tndra', {
      billableMemberId: flightPayload.billableMemberId,
      billingRemarks: flightPayload.billingRemarks,
      isBillableFlight: flightPayload.isBillableFlight,
      nonBillingApprovedByMemberId: flightPayload.nonBillingApprovedByMemberId,
      nonBillingReason: flightPayload.nonBillingReason,
      personalRemarks: flightPayload.personalRemarks,
      // entryErrorFeeAppliedByMemberId is auto-set to null by the server when entryErrorFee=false
    }))

  it('should lock fields for member after flight is validated', async () =>
    updateAndRevertFlight(jukkaToken, 'Jukka1', 'da40tndra', {
      billingRemarks: flightPayload.billingRemarks,
      personalRemarks: flightPayload.personalRemarks,
    }))

  it('should lock fields for admin after flight is billed', async () => {
    const patchResponse = await request(app)
      .patch(`/flight-log/efnu4evr`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send(flightPayload)

    expect(patchResponse.status).toBe(400)
  })

  it('should lock fields for member after flight is billed', async () =>
    updateAndRevertFlight(jukkaToken, 'Jukka1', 'efnu4evr', {
      personalRemarks: flightPayload.personalRemarks,
    }))

  afterAll(async () => {
    // updateAndRevertFlight auto-sets non_billing_approved_by_member_id and
    // entry_error_fee_applied_by_member_id whenever isBillableFlight/entryErrorFee
    // appear in the payload — reset them to their original null state.
    await db
      .updateTable('flight.logs')
      .set({
        non_billing_approved_by_member_id: null,
        entry_error_fee_applied_by_member_id: null,
      })
      .where('flight_id', '=', 'da40tndra')
      .execute()
  })
})

describe('POST /flight-log/validate', () => {
  let firstNewMassFlightId: string
  let secondNewMassFlightId: string
  let latestValidatedBeforeNewMassFlightId: string

  beforeAll(async () => {
    const massFlights = await db
      .selectFrom('flight.logs')
      .select(['flight_id as flightId', 'status'])
      .where('flight_id', 'like', 'mass%')
      .orderBy('off_block_time_utc', 'asc')
      .execute()

    const firstNewMassFlightIdx = massFlights.findIndex((flight) => flight.status === 'NEW')
    assert(firstNewMassFlightIdx > 0)
    assert(firstNewMassFlightIdx + 1 < massFlights.length)

    firstNewMassFlightId = massFlights[firstNewMassFlightIdx].flightId
    secondNewMassFlightId = massFlights[firstNewMassFlightIdx + 1].flightId
    latestValidatedBeforeNewMassFlightId = massFlights[firstNewMassFlightIdx - 1].flightId
  })

  it('should return a 401 if an invalid JWT token is passed', async () => {
    const invalidToken = 'THIS WILL NOT WORK'

    const response = await request(app)
      .post('/flight-log/efnu4evr/validate')
      .set('Cookie', `accessToken=${invalidToken}`)
      .send()

    expect(response.status).toBe(401)
  })
  it('should return a 403 if billable members tries to validate his own flight', async () => {
    const response = await request(app)
      .post('/flight-log/mikify/validate')
      .set('Cookie', `accessToken=${mattiToken}`)
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
      .set('Cookie', `accessToken=${adminToken}`)
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
      .set('Cookie', `accessToken=${adminToken}`)
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
      .post(`/flight-log/${secondNewMassFlightId}/validate`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send()

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: `/flight-log/${secondNewMassFlightId}/validate`,
      timestamp: expect.any(String),
      detail: `All previous flights must be first validated, validate ${firstNewMassFlightId} first`,
    })
  })

  it('should return a 400 if there are later validated flights', async () => {
    const response = await request(app)
      .post('/flight-log/mass100/validate')
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ revert: true })

    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/flight-log/mass100/validate',
      timestamp: expect.any(String),
      detail: `All later flights must be first reverted, revert ${latestValidatedBeforeNewMassFlightId} first`,
    })
  })

  it('should validate and revert the first new flight', async () => {
    const response = await request(app)
      .post(`/flight-log/${firstNewMassFlightId}/validate`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send()

    expect(response.status).toEqual(200)
    expect(response.body.flightId).toEqual(firstNewMassFlightId)
    expect(response.body.acTotalFlightTime).toEqual(expect.stringMatching(/^\d+:\d{2}$/))
    expect(response.body.ajlbPageNo).toEqual(expect.any(Number))
    expect(response.body.ajlbRowNo).toEqual(expect.any(Number))
    expect(response.body.status).toEqual('VALIDATED')

    const revert = await request(app)
      .post(`/flight-log/${firstNewMassFlightId}/validate`)
      .set('Cookie', `accessToken=${adminToken}`)
      .send({ revert: true })
    expect(revert.status).toEqual(200)
    expect(revert.body.flightId).toEqual(firstNewMassFlightId)
    expect(revert.body.acTotalFlightTime).toEqual(response.body.acTotalFlightTime)
    expect(revert.body.ajlbPageNo).toEqual(response.body.ajlbPageNo)
    expect(revert.body.ajlbRowNo).toEqual(response.body.ajlbRowNo)
    expect(revert.body.status).toEqual('NEW')
  })
})

describe('DELETE /flight-log', () => {
  it('should return 404 when flight does not exist', async () => {
    const response = await request(app)
      .delete('/flight-log/100')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(404)
  })

  it('should return 403 when user does not have rights to delete a flight log', async () => {
    const delToken = generateAccessToken({
      memberId: 'Iceman99',
      lastName: 'Test',
      email: 'invalid@mik.fi',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
      canMakeReservations: false,
    })

    const response = await request(app)
      .delete('/flight-log/da40tndra')
      .set('Cookie', `accessToken=${delToken}`)

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
      .set('Cookie', `accessToken=${adminToken}`)

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
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(200)
    expect(maskLandingTotals(response.body[1])).toMatchSnapshot()
  })

  it('should return 200 with valid registration', async () => {
    const response = await request(app)
      .get('/flight-log/OH-STL/totals')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(200)
    expect(maskLandingTotals(response.body[0])).toMatchSnapshot()
  })

  it('should return 404 with invalid registration', async () => {
    const response = await request(app)
      .get('/flight-log/OH-ABC/totals')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(404)
  })
})

describe('GET /flight-log/stats', () => {
  let createdFlightId: string

  afterAll(async () => {
    if (createdFlightId) {
      await db.deleteFrom('flight.logs').where('flight_id', '=', createdFlightId).execute()
    }
  })

  it('should return 403 with no permissions', async () => {
    const token = generateAccessToken({
      memberId: 'simplbks',
      lastName: 'Depp',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [],
      canMakeReservations: false,
    })

    const response = await request(app)
      .get('/flight-log/stats')
      .set('Cookie', `accessToken=${token}`)

    expect(response.status).toBe(403)
  })

  it('should return 200 with no flights', async () => {
    const token = generateAccessToken({
      memberId: 'simplbks',
      lastName: 'Depp',
      email: 'jonny.depp@mik.fi',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
      canMakeReservations: false,
    })

    const response = await request(app)
      .get('/flight-log/stats')
      .set('Cookie', `accessToken=${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      stats: [],
    })
  })

  it('should return 200 with single plane', async () => {
    const beforeResponse = await request(app)
      .get('/flight-log/stats')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(beforeResponse.status).toBe(200)
    const previousStats = beforeResponse.body.stats.find(
      (entry: { aircraftRegistration: string }) => entry.aircraftRegistration === 'OH-STL',
    )
    assert(previousStats)

    const currentMinuteAlignedSeconds = Math.floor(Date.now() / 60000) * 60
    const takeoffTimeEpoch = currentMinuteAlignedSeconds - 60 * 60
    const landingTimeEpoch = takeoffTimeEpoch + 55 * 60
    const offBlockTimeEpoch = takeoffTimeEpoch - 10 * 60
    const onBlockTimeEpoch = landingTimeEpoch + 5 * 60
    const offBlockTimeEpochString = offBlockTimeEpoch.toString()
    const takeoffTimeEpochString = takeoffTimeEpoch.toString()
    const landingTimeEpochString = landingTimeEpoch.toString()
    const onBlockTimeEpochString = onBlockTimeEpoch.toString()

    const createResponse = await request(app)
      .post('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .send({
        ...flightPayload,
        picMemberId: test_member_id,
        offBlockTimeEpoch: offBlockTimeEpochString,
        takeoffTimeEpoch: takeoffTimeEpochString,
        landingTimeEpoch: landingTimeEpochString,
        onBlockTimeEpoch: onBlockTimeEpochString,
      })

    expect(createResponse.status).toBe(201)
    createdFlightId = createResponse.body.flight_id
    expect(createdFlightId).toBeDefined()

    const createdFlightResponse = await request(app)
      .get(`/flight-log/${createdFlightId}`)
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(createdFlightResponse.status).toBe(200)
    expect(createdFlightResponse.body.aircraftRegistration).toBe('OH-STL')
    expect(createdFlightResponse.body.takeoffTimeEpoch).toBe(takeoffTimeEpochString)

    const response = await request(app)
      .get('/flight-log/stats')
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(response.status).toBe(200)
    const afterStats = response.body.stats.find(
      (entry: { aircraftRegistration: string }) => entry.aircraftRegistration === 'OH-STL',
    )
    expect(afterStats).toMatchObject({
      aircraftRegistration: 'OH-STL',
      landings12month: previousStats.landings12month + 1,
      landings1month: previousStats.landings1month + 1,
      landings3month: previousStats.landings3month + 1,
      landings6month: previousStats.landings6month + 1,
      lastFlightId: createdFlightId,
      // takeoffTimeEpoch variable is in epoch seconds; Date expects milliseconds.
      lastTakeoffTimeUtc: new Date(takeoffTimeEpoch * 1000).toISOString(),
      time12month: previousStats.time12month + 55,
      time1month: previousStats.time1month + 55,
      time3month: previousStats.time3month + 55,
      time6month: previousStats.time6month + 55,
      totalFlightMins: previousStats.totalFlightMins + 55,
      totalFlights: previousStats.totalFlights + 1,
      totalLandings: previousStats.totalLandings + 1,
    })

    // Cleanup: delete the flight we created so subsequent tests see a clean DB
    const deleteResponse = await request(app)
      .delete(`/flight-log/${createdFlightId}`)
      .set('Cookie', `accessToken=${mattiToken}`)
    expect(deleteResponse.status).toBe(204)
  })

  //TODO: fix test data and reenable test
  it.skip('should return 200 with multiple planes', async () => {
    const response = await request(app)
      .get('/flight-log/stats')
      .set('Cookie', `accessToken=${jukkaToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      stats: [
        {
          aircraftRegistration: 'OH-IHQ',
          landings12month: 0,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'efnu4evr',
          lastTakeoffTimeUtc: '2025-03-02T09:20:00.000Z',
          time12month: 0,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 120,
          totalFlights: 1,
          totalLandings: 2,
        },
        {
          aircraftRegistration: 'OH-P28',
          landings12month: 0,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'da40tndra',
          lastTakeoffTimeUtc: '2025-03-04T11:30:00.000Z',
          time12month: 0,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 110,
          totalFlights: 1,
          totalLandings: 3,
        },
        {
          aircraftRegistration: 'total',
          landings12month: 0,
          landings1month: 0,
          landings3month: 0,
          landings6month: 0,
          lastFlightId: 'da40tndra',
          lastTakeoffTimeUtc: '2025-03-04T11:30:00.000Z',
          time12month: 0,
          time1month: 0,
          time3month: 0,
          time6month: 0,
          totalFlightMins: 230,
          totalLandings: 5,
        },
      ],
    })

    const deleteResponse = await request(app)
      .delete(`/flight-log/${createdFlightId}`)
      .set('Cookie', `accessToken=${mattiToken}`)

    expect(deleteResponse.status).toBe(204)
  })
})
