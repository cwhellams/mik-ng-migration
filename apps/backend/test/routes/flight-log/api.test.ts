import express, { type NextFunction } from 'express'
import request from 'supertest'

import flightLogRouter from '../../../src/routes/flight-log/api.ts'
import {
  FlightLogInsertSchema,
  MIKRoles,
  type FlightLogInsertRequest,
} from '../../../src/routes/members/models.ts'

const test_member_id = 1

type AuthenticateFunction = (
  strategy: string,
  options: { session: boolean },
) => (req: Request, res: Response, next: NextFunction) => void

type UseFunction = (strategy: any) => void
interface MockedPassport {
  authenticate: jest.MockedFunction<AuthenticateFunction>
  use: jest.MockedFunction<UseFunction>
}

interface AuthenticatedRequest extends Request {
  user: {
    memberId: number
    email: string
    roles: MIKRoles[]
  }
}

jest.mock('passport', () => {
  const mockedPassport: MockedPassport = {
    authenticate: jest.fn(
      (_strategy: string, _options: { session: boolean }) =>
        (req: Request, res: Response, next: NextFunction) => {
          ;(req as AuthenticatedRequest).user = {
            memberId: test_member_id,
            email: 'jonny.depp@mik.fi',
            roles: [MIKRoles.ADMIN, MIKRoles.USER],
          }
          next()
        },
    ),
    use: jest.fn((_strategy: any) => {}), // No op
  }
  return mockedPassport
})

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/flight-log', flightLogRouter)
const token = 'mocked-jwt-token'

describe('GET /flight-log', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 200 with valid query params', async () => {
    const response = await request(app)
      .get('/flight-log')
      .set('Authorization', `Bearer ${token}`)
      .query({
        member_id: test_member_id,
      })

    //expect(mockedPassport.authenticate).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)

    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
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
    expect(response.body[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
  it('Get flight log with Id should return a single row when data is present for the given Id', async () => {
    const response = await request(app).get('/flight-log/1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
  it('Get flight log with Id should return a 404 when now row is present for the given Id', async () => {
    const response = await request(app).get('/flight-log/100')

    expect(response.status).toBe(404)
    expect(response.body.message).toMatch(/Flight log not found/)
  })
})

describe('POST /flight-log', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

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
