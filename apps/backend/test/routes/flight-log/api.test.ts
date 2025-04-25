import dotenv from 'dotenv'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  type FlightLogInsertRequest,
  type FlightLogUpdateRequest,
} from '../../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { generateShortId } from '../../../src/util/nanoId.ts'

const test_member_id = 'Matti1'
const test_member_id2 = 'Sanna1'
const admin_member_id = 'Pekka1'
dotenv.config()

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)

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
      .query({ aircraft_registration: 'OH-STL' })

    expect(response.status).toBe(200)

    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('should return all data for ac when user is admin', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ aircraft_registration: 'OH-STL' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot([
      {
        created_at: expect.any(String),
        updated_at: expect.any(String),
        updated_by: expect.any(String),
      },
      {
        created_at: expect.any(String),
        updated_at: expect.any(String),
        updated_by: expect.any(String),
      },
      {
        created_at: expect.any(String),
        updated_at: expect.any(String),
        updated_by: expect.any(String),
      },
    ])
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        billable_member_id: test_member_id,
      })

    expect(response.status).toBe(200)

    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('should return 400 for invalid member_id', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        billable_member_id2: null,
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(
      "Unrecognized key(s) in object: 'billable_member_id2'",
    )
  })

  it('should return 200 for Start Date with time offset', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        startDate: (new Date('2025-03-04T13:15:00+02:00').getTime() / 1000).toString(),
      })

    expect(response.status).toBe(200)
    expect(response.body[0]).toMatchSnapshot()
  })

  it('should return 400 for non-existent startDate', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        startDate: '2025-02-29',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch('Must be a valid epoch time in seconds')
  })

  it('should return 400 for invalid startDate', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)
      .query({
        endDate: 'not-a-date',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch('Must be a valid epoch time in seconds')
  })

  it('should allow query parameters to be optional', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/mikify')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      flight_id: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('Get flight log with Id should return a 404 when now row is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/100')
      .set('Authorization', `Bearer ${mattiToken}`)
    expect(response.status).toBe(404)
    expect(response.body.message).toMatch(/Flight log not found/)
  })
})

describe('POST /flight-log', () => {
  test.each([
    ['Sanna1', false, sannaToken],
    ['Matti1', true, mattiToken],
  ])(
    'should create a flight log with valid payload , return flight_id and be deleted using the returned id',
    async (memberId: string, isDtoFlight: boolean, token: string) => {
      const payload: FlightLogInsertRequest = {
        flight_id: generateShortId(),
        aircraft_registration: 'OH-STL',
        arrival_airport: 'EFHK',
        billable_member_id: test_member_id,
        billing_remarks: 'N/A',
        pic_member_id: memberId,
        pic_role: 'FI',
        departure_airport: 'EFHK',
        flight_type: 'KOU',
        is_billable_flight: true,
        non_billing_reason: null,
        fuel_uplift_litres: 40,
        fuel_remaining_litres: 20,
        incident_or_observations: 'N/A',
        night_flying_mins: 20,
        number_of_landings: 1,
        off_block_time_epoch: (new Date('2025-03-22T10:30:00Z').getTime() / 1000).toString(),
        takeoff_time_epoch: (new Date('2025-03-22T10:45:00Z').getTime() / 1000).toString(),
        landing_time_epoch: (new Date('2025-03-22T11:40:00Z').getTime() / 1000).toString(),
        on_block_time_epoch: (new Date('2025-03-22T11:45:00Z').getTime() / 1000).toString(),
        oil_uplift_litres: 0.2,
        persons_on_board: 3,
        personal_remarks: 'N/A',
        ajlb_seq_no: 1,
        ajlb_blank_rows_before: 0,
        total_time_in_service: 0.2,
        priv_or_com_flight: 'P',
        instrument_flying_mins: 0,
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
      expect(checkPost.body.is_dto_training_flight).toBe(isDtoFlight)

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
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Required/)
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
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Required/)
  })
})

describe('PATCH /flight-log/', () => {
  test.each([
    ['Matti1', [MIKPermissions.FLIGHTLOG_ADMIN]],
    ['Kaisa1', [MIKPermissions.FLIGHTLOG_USER]],
  ])(
    'should update a flight log when billable member matches token member or user has elevated role, using %d and %s',
    async (memberId, permissions) => {
      const payload: FlightLogUpdateRequest = {
        crew2_member_id: 'Antti1',
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
        updated_at: expect.any(String),
        created_at: expect.any(String),
      })

      const undoPayload: FlightLogUpdateRequest = {
        crew2_member_id: 'Antti1',
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
        updated_at: expect.any(String),
        created_at: expect.any(String),
      })
    },
  )
  it('should return a 401 if an invalid JWT token is passed', async () => {
    const payload: FlightLogUpdateRequest = {
      crew2_member_id: 'Liisa1',
    }

    const invalidToken = 'THIS WILL NOT WORK'

    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send(payload)

    expect(response.status).toBe(401)
  })
  it('should return a 404 if the billable member id does not match token ID for a USER', async () => {
    const payload: FlightLogUpdateRequest = {
      crew2_member_id: 'Liisa1',
    }

    const invalidToken = generateAccessToken({
      memberId: 'Liisa1', // billable_member_id
      email: 'test@mik.fi',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    //Creaate a token with a member id that matches billable member id
    const response = await request(app)
      .patch('/flight-log/efnu4evr')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send(payload)

    expect(response.status).toBe(403)
    expect(response.body.message).toMatch(
      /Flight log not owned by user or user has no admin rights/,
    )
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

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: [`Unrecognized key(s) in object: 'this_is_invalid'`],
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

    expect(response.status).toBe(403)
  })

  it('should return 400 when flight has been billed', async () => {
    const response = await request(app)
      .delete('/flight-log/mikify')
      .set('Authorization', `Bearer ${mattiToken}`)

    expect(response.status).toBe(400)
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
