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
  type FlightLogListEntry,
} from '@mik/contracts/flight-log'
import { MIKPermissions } from '@mik/contracts/members'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { flightPayload } from './fixtures.ts'
import { audit } from '../../util/helpers.ts'
import assert from 'node:assert/strict'

const test_member_id = 'Matti1'
const test_member_id2 = 'Sanna1'
const jukka_member_id = 'Jukka1'
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
  memberId: jukka_member_id,
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
      detail: 'Unrecognized key: "billable_member_id2"',
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
    // 17 flights billed to Matti1 plus fi_inst1, which is billed to their instructor but
    // which Matti1 flew as STU — crew flights are in a member's own log by default since
    // #1019, so this count is one higher than it was.
    expect(response.body.logs).toHaveLength(18)
    expect(maskLandingTotals(response.body.logs[0])).toMatchSnapshot()
  })

  it('should drop the crew flight again when includeCrewFlights is false', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({ startDate: '2025-03-01T00:00:00Z', includeCrewFlights: 'false' })

    expect(response.status).toBe(200)
    expect(response.body.logs).toHaveLength(17)
    expect(response.body.logs.map((log: FlightLog) => log.flightId)).not.toContain('fi_inst1')
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

  it('should preserve NEW status for other members flights (non-admin)', async () => {
    // Non-admin user (Jukka) viewing logbook page 10 of OH-STL seq 2, which contains
    // Matti's NEW flight 'mikify'. The NEW status should NOT be clamped to VALIDATED
    // since verification state should be visible.
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${jukkaToken}`)
      .query({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 2,
        page: 10,
      })

    expect(response.status).toBe(200)
    const mikifyFlight = response.body.logs.find(
      (log: { flightId: string }) => log.flightId === 'mikify',
    )
    expect(mikifyFlight).toBeDefined()
    expect(mikifyFlight.billableMemberId).toBe(test_member_id)
    expect(mikifyFlight.status).toBe(FlightLogStatus.NEW)
  })

  it('should clamp billing-sensitive statuses to VALIDATED for other members flights (non-admin)', async () => {
    // Non-admin user (Matti) viewing logbook page 81 of OH-IHQ seq 2, which contains
    // Jukka's INVOICED flight 'efnu4evr'. The INVOICED status should be clamped to
    // VALIDATED to hide billing details.
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({
        aircraftRegistration: 'OH-IHQ',
        ajlbSeqNo: 2,
        page: 81,
      })

    expect(response.status).toBe(200)
    const jukkaFlight = response.body.logs.find(
      (log: { flightId: string }) => log.flightId === 'efnu4evr',
    )
    expect(jukkaFlight).toBeDefined()
    expect(jukkaFlight.billableMemberId).toBe(jukka_member_id)
    expect(jukkaFlight.status).toBe(FlightLogStatus.VALIDATED)
    // Invoice number and other billing-sensitive fields should be hidden
    expect(jukkaFlight.invoiceNumber).toBeNull()
    expect(jukkaFlight.isBilled).toBe(false)

    // When Jukka views the same page, they should see their actual INVOICED status
    const jukkaResponse = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${jukkaToken}`)
      .query({
        aircraftRegistration: 'OH-IHQ',
        ajlbSeqNo: 2,
        page: 81,
      })

    expect(jukkaResponse.status).toBe(200)
    const ownFlight = jukkaResponse.body.logs.find(
      (log: { flightId: string }) => log.flightId === 'efnu4evr',
    )
    expect(ownFlight).toBeDefined()
    expect(ownFlight.status).toBe(FlightLogStatus.INVOICED)
    expect(ownFlight.invoiceNumber).toBe('INV002')

    // Admin viewing the same page sees the real billing status regardless of ownership
    const adminResponse = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({
        aircraftRegistration: 'OH-IHQ',
        ajlbSeqNo: 2,
        page: 81,
      })

    expect(adminResponse.status).toBe(200)
    const adminViewOfJukkaFlight = adminResponse.body.logs.find(
      (log: { flightId: string }) => log.flightId === 'efnu4evr',
    )
    expect(adminViewOfJukkaFlight).toBeDefined()
    expect(adminViewOfJukkaFlight.status).toBe(FlightLogStatus.INVOICED)
    expect(adminViewOfJukkaFlight.invoiceNumber).toBe('INV002')
  })

  it('should return 403 when non-admin requests flights for another member via anyCrewMemberId', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({ anyCrewMemberId: 'Sanna1' })

    expect(response.status).toBe(403)
    expect(response.body.detail).toMatch(/Insufficient permissions/)
  })

  it('should allow non-admin to request their own flights via anyCrewMemberId', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${mattiToken}`)
      .query({ anyCrewMemberId: test_member_id })

    expect(response.status).toBe(200)
  })

  it('should allow admin to request any member flights via anyCrewMemberId', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${adminToken}`)
      .query({ anyCrewMemberId: 'Sanna1' })

    expect(response.status).toBe(200)
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
    'should create a flight log with valid payload , return flightId and be deleted using the returned id',
    async (memberId: string, isDtoFlight: boolean, token: string) => {
      const response = await request(app)
        .post('/flight-log')
        .set('Cookie', `accessToken=${token}`)
        .send({
          ...flightPayload,
          picMemberId: memberId,
        })

      expect(response.body.flightId).toBeDefined()
      const id = response.body.flightId
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
      detail: '86400',
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'too_big',
          inclusive: true,
          maximum: 86400,
          message: '86400',
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
        nonBillingApprovedByMemberId: null,
        entryErrorFeeAppliedByMemberId: null,
      })
      .where('flightId', '=', 'da40tndra')
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
          maximum: 86400,
          message: '86400',
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
        nonBillingApprovedByMemberId: null,
        entryErrorFeeAppliedByMemberId: null,
      })
      .where('flightId', '=', 'da40tndra')
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
      .select(['flightId', 'status'])
      .where('flightId', 'like', 'mass%')
      .orderBy('offBlockTimeUtc', 'asc')
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
      await db.deleteFrom('flight.logs').where('flightId', '=', createdFlightId).execute()
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
    createdFlightId = createResponse.body.flightId
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

// ─── #1019: flights the member flew as crew but is not billed for ─────────────
//
// The fixtures already contain the shape the issue describes:
//   mikify    OH-STL  billed Matti1, Liisa1 STU (slot 1), Jukka1 FI (crew2), NEW
//   da40tndra OH-P28  billed Jukka1, Pekka1 FI (crew2), VALIDATED, invoice INV003
// so Jukka1 and Liisa1 are crew on a flight someone else pays for, and Pekka1 is crew on
// one that has already been validated and invoiced.
describe('crew flights in a member own flight log', () => {
  const crewMemberToken = (memberId: string, permissions = [MIKPermissions.FLIGHTLOG_USER]) =>
    generateAccessToken({
      memberId,
      lastName: 'Test',
      email: 'test@mik.fi',
      roles: [],
      permissions,
      canMakeReservations: false,
    })

  const instructorToken = crewMemberToken('Jukka1', [
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.DTO_INSTRUCTOR,
  ])
  const pekkaToken = crewMemberToken('Pekka1')
  const pekkaInstructorToken = crewMemberToken('Pekka1', [
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.DTO_INSTRUCTOR,
  ])
  const strangerToken = crewMemberToken('Iceman99')

  // Editing tests here write to fixtures that snapshot tests elsewhere in this file also
  // assert on — including `updated_by`, which every accepted PATCH rewrites even when the
  // member-level schema strips the patch down to nothing. Restore the whole row rather
  // than PATCHing values back, which would just stamp a different member on it.
  const FIXTURES = ['mikify', 'da40tndra'] as const
  let originals: {
    flightId: string
    incidentOrObservations: string | null
    billingRemarks: string | null
    updatedBy: string
  }[]

  beforeAll(async () => {
    originals = await db
      .selectFrom('flight.logs')
      .select(['flightId', 'incidentOrObservations', 'billingRemarks', 'updatedBy'])
      .where('flightId', 'in', FIXTURES)
      .execute()
  })

  afterAll(async () => {
    for (const original of originals) {
      await db
        .updateTable('flight.logs')
        .set({
          incidentOrObservations: original.incidentOrObservations,
          billingRemarks: original.billingRemarks,
          updatedBy: original.updatedBy,
        })
        .where('flightId', '=', original.flightId)
        .execute()
    }
  })

  const listOhStl = (token: string, query: Record<string, string> = {}) =>
    request(app)
      .get('/flight-log')
      .set('Cookie', `accessToken=${token}`)
      .query({ aircraftRegistration: 'OH-STL', ...query })

  describe('GET /flight-log', () => {
    it('includes flights the member flew as crew by default', async () => {
      // Jukka1 is billed for no OH-STL flight at all, so every row here is one they only
      // reach through a crew slot.
      const response = await listOhStl(jukkaToken)

      expect(response.status).toBe(200)
      expect(response.body.logs.map((log: FlightLog) => log.flightId)).toEqual(['mikify'])
    })

    it('narrows to own billable flights when the toggle is turned off', async () => {
      const response = await listOhStl(jukkaToken, { includeCrewFlights: 'false' })

      expect(response.status).toBe(200)
      expect(response.body.logs).toEqual([])
    })

    it('marks each row with the viewer own crew role and whether they are billed', async () => {
      const asInstructor = await listOhStl(jukkaToken)
      expect(asInstructor.body.logs[0]).toMatchObject({
        flightId: 'mikify',
        myCrewRole: 'FI',
        isOwnFlight: false,
      })

      const asBilledMember = await listOhStl(mattiToken)
      const mikify = asBilledMember.body.logs.find((log: FlightLog) => log.flightId === 'mikify')
      // Matti1 pays for the flight but sat in no crew slot on it
      expect(mikify).toMatchObject({ myCrewRole: null, isOwnFlight: true })
    })

    it('never sends another member crew ids in a list row', async () => {
      const response = await listOhStl(jukkaToken)

      expect(response.body.logs[0]).not.toHaveProperty('picMemberId')
      expect(response.body.logs[0]).not.toHaveProperty('crew2MemberId')
      expect(response.body.logs[0]).not.toHaveProperty('crew3MemberId')
      expect(response.body.logs[0]).not.toHaveProperty('crew4MemberId')
    })

    it('shows no price for a flight another member is invoiced for', async () => {
      const response = await listOhStl(jukkaToken)

      expect(response.body.logs[0].estimatedCost).toBeNull()
      expect(response.body.logs[0].invoiceNumber).toBeNull()
    })

    it('leaves the unbilled estimate unchanged by the toggle', async () => {
      const withCrew = await listOhStl(jukkaToken)
      const withoutCrew = await listOhStl(jukkaToken, { includeCrewFlights: 'false' })

      // The estimate is keyed on the member's own unbilled billable flights, so a
      // crew-only row cannot move it either way (#1019 Q1).
      expect(withCrew.body.unbilledEstimatedTotal).toEqual(withoutCrew.body.unbilledEstimatedTotal)
    })

    it('reports the true status of a flight the viewer was crew on', async () => {
      // mikify is NEW and stays NEW for its crew. It used to be clamped to VALIDATED for
      // everyone but the billable member, which showed the crew a status that was simply
      // not true (#1019 Q4).
      const response = await listOhStl(jukkaToken)
      expect(response.body.logs[0].status).toEqual(FlightLogStatus.NEW)
    })

    it('leaves #1222 redaction to do the work on a flight the viewer had no part in', async () => {
      // An aircraft logbook page is not the member's own log: it lists everyone's flights.
      // #1222 draws the line by status rather than by reader — NEW and VALIDATED describe
      // verification and are safe to show, the billing statuses are clamped — which is
      // also what #1019 Q4 wanted for crew, so there is nothing extra here for them.
      const response = await request(app)
        .get('/flight-log')
        .set('Cookie', `accessToken=${strangerToken}`)
        .query({ aircraftRegistration: 'OH-STL', ajlbSeqNo: 1, page: 1 })

      expect(response.status).toBe(200)
      const others = response.body.logs.filter(
        (log: FlightLogListEntry) => !log.isOwnFlight && log.myCrewRole == null,
      )
      expect(others.length).toBeGreaterThan(0)
      for (const log of others) {
        expect([FlightLogStatus.NEW, FlightLogStatus.VALIDATED]).toContain(log.status)
        if (log.status === FlightLogStatus.VALIDATED) {
          expect(log.invoiceNumber).toBeNull()
          expect(log.isBilled).toBe(false)
        }
      }
    })

    it('refuses a request for another member crew flights, whichever filter names them', async () => {
      // #1222 added this guard for anyCrewMemberId; onBoardMemberId is the same question
      // asked of a narrower set of crew roles, so it is held to the same rule rather than
      // being quietly overridden.
      for (const filter of ['anyCrewMemberId', 'onBoardMemberId']) {
        const response = await listOhStl(jukkaToken, { [filter]: 'Matti1' })
        expect(response.status).toBe(403)
      }
    })

    it('allows the crew filter when it names the requesting member', async () => {
      for (const filter of ['anyCrewMemberId', 'onBoardMemberId']) {
        const response = await listOhStl(jukkaToken, { [filter]: 'Jukka1' })
        expect(response.status).toBe(200)
        expect(response.body.logs.map((log: FlightLog) => log.flightId)).toEqual(['mikify'])
      }
    })

    it('still ignores a client-supplied billable member filter for a non-admin', async () => {
      // Not covered by the guard above, and it must not be: the member's own view always
      // takes its member id from the JWT, so asking for someone else's billable flights
      // returns the requester's own log rather than an error.
      const response = await listOhStl(jukkaToken, { billableMemberId: 'Matti1' })

      expect(response.status).toBe(200)
      expect(response.body.logs.map((log: FlightLog) => log.flightId)).toEqual(['mikify'])
    })
  })

  describe('GET /flight-log/:id', () => {
    it('lets a crew member open the flight, without the billing side of it', async () => {
      const response = await request(app)
        .get('/flight-log/da40tndra')
        .set('Cookie', `accessToken=${pekkaToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        flightId: 'da40tndra',
        // the operational entry is there in full
        aircraftRegistration: 'OH-P28',
        // ...and the billable member's money is not
        invoiceNumber: null,
        billingRemarks: null,
        personalRemarks: null,
        validationRemarks: null,
        nonBillingReason: null,
        nonBillingApprovedByMemberId: null,
        minBillableExceptionReason: null,
        entryErrorFee: false,
        entryErrorFeeAppliedByMemberId: null,
        isBilled: false,
        // the status is the flight's real one, as it is for every other crew member
        status: FlightLogStatus.VALIDATED,
      })
    })

    it('gives an instructor the billable member view while the entry is still editable', async () => {
      const response = await request(app)
        .get('/flight-log/mikify')
        .set('Cookie', `accessToken=${instructorToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        flightId: 'mikify',
        status: FlightLogStatus.NEW,
        billingRemarks: 'N/A',
        personalRemarks: 'Smooth flight',
      })
    })

    it('redacts for an instructor once the flight is no longer theirs to edit', async () => {
      // Pekka1 is FI on da40tndra, which is already VALIDATED and invoiced: the edit
      // window has closed, so there is no longer a reason to show them the student's
      // invoice number.
      const response = await request(app)
        .get('/flight-log/da40tndra')
        .set('Cookie', `accessToken=${pekkaInstructorToken}`)

      expect(response.status).toBe(200)
      expect(response.body.invoiceNumber).toBeNull()
      expect(response.body.personalRemarks).toBeNull()
    })

    it('returns 403 for a member who was in no crew slot', async () => {
      const response = await request(app)
        .get('/flight-log/mikify')
        .set('Cookie', `accessToken=${strangerToken}`)

      expect(response.status).toBe(403)
    })

    it('returns 403 for a member who was only carried as an observer', async () => {
      await db
        .updateTable('flight.logs')
        .set({ crew2Role: 'OBS' })
        .where('flightId', '=', 'mikify')
        .execute()
      try {
        const response = await request(app)
          .get('/flight-log/mikify')
          .set('Cookie', `accessToken=${jukkaToken}`)

        expect(response.status).toBe(403)
      } finally {
        await db
          .updateTable('flight.logs')
          .set({ crew2Role: 'FI' })
          .where('flightId', '=', 'mikify')
          .execute()
      }
    })
  })

  describe('PATCH and DELETE /flight-log/:id', () => {
    it('refuses an edit from a crew member without instructor rights', async () => {
      const response = await request(app)
        .patch('/flight-log/mikify')
        .set('Cookie', `accessToken=${jukkaToken}`)
        .send({ numberOfLandings: 9 })

      expect(response.body).toEqual({
        status: 403,
        title: 'Forbidden',
        detail: 'Flight log not owned by user or user has no admin rights',
        instance: '/flight-log/mikify',
        timestamp: expect.any(String),
      })
    })

    it('lets an instructor correct a still-new flight, and records who did it', async () => {
      const before = await request(app)
        .get('/flight-log/mikify')
        .set('Cookie', `accessToken=${mattiToken}`)

      const response = await request(app)
        .patch('/flight-log/mikify')
        .set('Cookie', `accessToken=${instructorToken}`)
        .send({ incidentOrObservations: 'Corrected by instructor' })

      expect(response.status).toBe(200)
      expect(response.body.incidentOrObservations).toEqual('Corrected by instructor')

      // ...and the change is on the record with the instructor's name against it
      const audit = await request(app)
        .get('/flight-log/mikify/audit')
        .set('Cookie', `accessToken=${mattiToken}`)

      expect(audit.status).toBe(200)
      expect(audit.body.entries[0]).toMatchObject({
        operationType: 'UPDATE',
        changedBy: 'Jukka1',
        changes: [
          {
            field: 'incidentOrObservations',
            before: before.body.incidentOrObservations,
            after: 'Corrected by instructor',
          },
        ],
      })
    })

    it('refuses an instructor edit to admin-only fields', async () => {
      const response = await request(app)
        .patch('/flight-log/mikify')
        .set('Cookie', `accessToken=${instructorToken}`)
        .send({ isBillableFlight: false, nonBillingReason: 'instructor should not set this' })

      // The member-level schema strips admin fields, so this is accepted and ignored
      // rather than rejected -- the point is that nothing changed.
      expect(response.status).toBe(200)
      expect(response.body.isBillableFlight).toBe(true)
      expect(response.body.nonBillingReason).toBeNull()
    })

    it('refuses an instructor edit once the flight is validated', async () => {
      const response = await request(app)
        .patch('/flight-log/da40tndra')
        .set('Cookie', `accessToken=${pekkaInstructorToken}`)
        .send({ personalRemarks: 'too late' })

      expect(response.body).toEqual({
        status: 403,
        title: 'Forbidden',
        detail: 'Flight log in status VALIDATED can no longer be edited by an instructor',
        instance: '/flight-log/da40tndra',
        timestamp: expect.any(String),
      })
    })

    it('never lets a crew member delete the flight, instructor or not', async () => {
      for (const token of [jukkaToken, instructorToken]) {
        const response = await request(app)
          .delete('/flight-log/mikify')
          .set('Cookie', `accessToken=${token}`)

        expect(response.status).toBe(403)
      }

      // the flight is still there
      const check = await request(app)
        .get('/flight-log/mikify')
        .set('Cookie', `accessToken=${mattiToken}`)
      expect(check.status).toBe(200)
    })

    it('refuses to validate for a crew member, instructor or not', async () => {
      for (const token of [jukkaToken, instructorToken]) {
        const response = await request(app)
          .post('/flight-log/mikify/validate')
          .set('Cookie', `accessToken=${token}`)
          .send()

        expect(response.status).toBe(403)
      }
    })
  })

  describe('GET /flight-log/:id/audit', () => {
    it('shows the billable member the whole trail', async () => {
      const response = await request(app)
        .get('/flight-log/da40tndra/audit')
        .set('Cookie', `accessToken=${jukkaToken}`)

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body.entries)).toBe(true)
    })

    it('hides the billing fields from a crew reader', async () => {
      // Give the trail something billing-shaped to hide.
      await request(app)
        .patch('/flight-log/da40tndra')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ billingRemarks: 'audit visibility test' })

      const asOwner = await request(app)
        .get('/flight-log/da40tndra/audit')
        .set('Cookie', `accessToken=${jukkaToken}`)
      const asCrew = await request(app)
        .get('/flight-log/da40tndra/audit')
        .set('Cookie', `accessToken=${pekkaToken}`)

      const fieldsOf = (body: { entries: { changes: { field: string }[] }[] }) =>
        body.entries.flatMap((entry) => entry.changes.map((change) => change.field))

      expect(fieldsOf(asOwner.body)).toContain('billingRemarks')
      expect(fieldsOf(asCrew.body)).not.toContain('billingRemarks')
    })

    it('returns 403 to a member with no part in the flight', async () => {
      const response = await request(app)
        .get('/flight-log/mikify/audit')
        .set('Cookie', `accessToken=${strangerToken}`)

      expect(response.status).toBe(403)
    })

    it('returns 404 for an unknown flight', async () => {
      const response = await request(app)
        .get('/flight-log/noup/audit')
        .set('Cookie', `accessToken=${mattiToken}`)

      expect(response.status).toBe(404)
    })
  })
})
