import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'

import type { JWTPayload } from '../../../src/routes/auth/user.ts'
import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  FlightLogInsertSchema,
  MIKRoles,
  type FlightLogInsertRequest,
  type FlightLogUpdateRequest,
} from '../../../src/routes/members/models.ts'
import logger from '../../../src/lib/logger.ts'

const test_member_id = 1

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)

const SECRET_KEY = process.env.JWT_SECRET!
const EXPIRATION_TIME = '1h'

function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: EXPIRATION_TIME })
}

function generateInvalidToken(payload: JWTPayload): string {
  return jwt.sign(payload, 'not the secret youre looking for', { expiresIn: EXPIRATION_TIME })
}

const token: string = generateToken({
  memberId: test_member_id,
  email: 'test@mik.fi',
  roles: [MIKRoles.USER],
})

describe('GET /flight-log', () => {
  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${token}`)
      .query({
        member_id: test_member_id,
      })

    expect(response.status).toBe(200)

    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('should return 400 for invalid member_id', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${token}`)
      .query({
        member_id: 'not_a_number',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Expected number, received nan/)
  })

  it('should return 400 for invalid startDate', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${token}`)
      .query({
        startDate: 'invalid_date',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Invalid date/)
  })

  it('should allow query parameters to be optional', async () => {
    const response = await request(app).get('/flight-log').set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app).get('/flight-log/1').set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
  it('Get flight log with Id should return a 404 when now row is present for the given Id', async () => {
    const response = await request(app)
      .get('/flight-log/100')
      .set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(404)
    expect(response.body.message).toMatch(/Flight log not found/)
  })
})

describe('POST /flight-log', () => {
  it('should create a flight log with valid payload , return flight_id and be deleted using the returned id', async () => {
    const payload: FlightLogInsertRequest = FlightLogInsertSchema.parse({
      aircraft_registration: 'OH-STL',
      arrival_airport: 'EFHK',
      billable_member_id: test_member_id,
      billing_remarks: 'N/A',
      captain_member_id: 1,
      captain: 'Salminen',
      copilot: null,
      created_by: 'user3',
      departure_airport: 'EFHK',
      flight_date: '2025-02-27',
      flight_type: 'KOU',
      fuel_uplift_litres: 40,
      landing_time_utc: '12:00',
      night_hours: '00:20',
      number_of_landings: 1,
      off_block_time_utc: '10:20',
      oil_uplift_litres: 0.2,
      on_block_time_utc: '10:00',
      persons_on_board: 3,
      takeoff_time_utc: '09:30',
      updated_by: 'user3',
    })

    const response = await request(app)
      .post('/flight-log')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    expect(response.body.flight_id).toBeDefined()
    const id = response.body.flight_id
    expect(id).toBeGreaterThan(5)
    expect(response.status).toBe(201)

    // Cleanup
    const delResponse = await request(app)
      .delete(`/flight-log/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json')
    expect(delResponse.status).toBe(204)
    expect(delResponse.body).toEqual({})
  })

  it('should return 400 for invalid payload', async () => {
    const payload = {
      member_id: 'invalid_id',
      flight_date: 'invalid_date',
      // other fields with invalid data
    }

    const response = await request(app)
      .post('/flight-log')
      .set('Authorization', `Bearer ${token}`)
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
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Required/)
  })
})

describe('PATCH /flight-log/', () => {
  test.each([
    [1, [MIKRoles.ADMIN]],
    [1, [MIKRoles.COMMITTEE]],
    [4, [MIKRoles.USER]],
    [1, [MIKRoles.COMMITTEE, MIKRoles.USER]],
  ])(
    'should update a flight log when billable member matches token member or user has elevated role, using %d and %s',
    async (memberId, roles) => {
      const payload: FlightLogUpdateRequest = {
        copilot: 'Smith',
        copilot_member_id: 2,
      }

      //Creaate a token with a member id that matches billable member id
      const token = generateToken({
        memberId: memberId,
        email: 'valid@mik.fi',
        roles: roles,
      })

      const response = await request(app)
        .patch('/flight-log/3')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)

      expect(response.status).toBe(204)

      const undoPayload: FlightLogUpdateRequest = {
        copilot: null,
        copilot_member_id: null,
      }
      const undoResponse = await request(app)
        .patch('/flight-log/3')
        .set('Authorization', `Bearer ${token}`)
        .send(undoPayload)

      expect(undoResponse.status).toBe(204)
    },
  )
  it('should return a 401 if an invalid JWT token is passed', async () => {
    const payload: FlightLogUpdateRequest = {
      copilot: 'Smith',
      copilot_member_id: 2,
    }

    //Creaate a token with a member id that matches billable member id
    const invalidToken = generateInvalidToken({
      memberId: 4, // billable_member_id
      email: 'valid@mik.fi',
      roles: [MIKRoles.USER],
    })

    const response = await request(app)
      .patch('/flight-log/3')
      .set('Authorization', `Bearer ${invalidToken}`)
      .send(payload)

    expect(response.status).toBe(401)
  })
  it('should return a 404 if the billable member id does not match token ID for a USER', async () => {
    const payload: FlightLogUpdateRequest = {
      copilot: 'Smith',
      copilot_member_id: 2,
    }

    //Creaate a token with a member id that matches billable member id
    const response = await request(app)
      .patch('/flight-log/3')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)

    expect(response.status).toBe(404)
    expect(response.body.message).toMatch(/Flight log not found or flight not billable to member/)
  })
  it('should return a 400 if the payload is not valid', async () => {
    const payload: any = {
      this_is_invalid: 'invalid',
    }

    //Creaate a token with a member id that matches billable member id
    const response = await request(app)
      .patch('/flight-log/3')
      .set('Authorization', `Bearer ${token}`)
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
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(404)
  })

  it('should return 403 when user does not have rights to delete a flight log', async () => {
    const delToken = generateToken({
      memberId: 99,
      email: 'invalid@mik.fi',
      roles: [MIKRoles.USER],
    })

    const response = await request(app)
      .delete('/flight-log/1')
      .set('Authorization', `Bearer ${delToken}`)

    expect(response.status).toBe(403)
  })

  it('should return 400 when flight has been billed', async () => {
    const response = await request(app)
      .delete('/flight-log/1')
      .set('Authorization', `Bearer ${token}`)

    expect(response.status).toBe(400)
  })
})
