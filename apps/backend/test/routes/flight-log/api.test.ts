import express from 'express'
import request from 'supertest'

import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  FlightLogInsertSchema,
  type FlightLogInsertRequest,
} from '../../../src/routes/members/models.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)

describe('GET /flight-log', () => {
  it('should return 200 with valid query params', async () => {
    const response = await request(app).get('/flight-log').query({
      member_id: 1,
    })

    expect({
      ...response.body,
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    }).toMatchSnapshot()
  })

  it('should return 400 for invalid member_id', async () => {
    const response = await request(app).get('/flight-log').query({
      member_id: 'not_a_number',
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Expected number, received nan/)
  })

  it('should return 400 for invalid startDate', async () => {
    const response = await request(app).get('/flight-log').query({
      startDate: 'invalid_date',
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Invalid date/)
  })

  it('should allow query parameters to be optional', async () => {
    const response = await request(app).get('/flight-log')

    expect(response.status).toBe(200)
    expect({
      ...response.body,
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    }).toMatchSnapshot()
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app).get('/flight-log/1')

    expect(response.status).toBe(200)
    expect({
      ...response.body,
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    }).toMatchSnapshot()
  })
  it('Get flight log with Id should return a 404 when now row is present for the given Id', async () => {
    const response = await request(app).get('/flight-log/100')

    expect(response.status).toBe(404)
    expect(response.body.message).toMatch(/Flight log not found/)
  })
})
describe('POST /flight-log', () => {
  it('should create a flight log with valid payload , return flight_id and be deleted using the returned id', async () => {
    const payload: FlightLogInsertRequest = FlightLogInsertSchema.parse({
      aircraft_registration: 'OH-STL',
      arrival_airport: 'EFHK',
      billable_member_id: 4,
      billing_remarks: 'N/A',
      captain_member_id: 1,
      captain: 'Salminen',
      copilot: null,
      created_by: 'user3',
      departure_airport: 'EFHK',
      flight_date: new Date('2025-03-02'),
      flight_type: 'KOU',
      fuel_uplift_litres: 40,
      landing_time_utc: '12:00:00',
      night_hours: '00:20:00',
      number_of_landings: 1,
      off_block_time_utc: '10:20:00',
      oil_uplift_litres: 0.2,
      on_block_time_utc: '10:00:00',
      persons_on_board: 3,
      takeoff_time_utc: '09:30:00',
      updated_by: 'user3',
    })

    const response = await request(app).post('/flight-log').send(payload)

    expect(response.body.flight_id).toBeDefined()
    const id = response.body.flight_id
    expect(id).toBeGreaterThan(5)
    expect(response.status).toBe(201)

    // Cleanup
    const delResponse = await request(app)
      .delete(`/flight-log/${id}`) // Appending the ID to the path
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

    const response = await request(app).post('/flight-log').send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Required/)
  })

  it('should return 400 for missing required fields', async () => {
    const payload = {
      // missing required fields
    }

    const response = await request(app).post('/flight-log').send(payload)

    expect(response.status).toBe(400)
    expect(response.body.error).toBeDefined()
    expect(response.body.error[0].message).toMatch(/Required/)
  })
})
