import dotenv from 'dotenv'

import { closeDb } from '../../src/db/connection.ts'
import {
  deleteFlightLog,
  getAllFlightLogs,
  getMemberRoles,
  getMembers,
  insertFlightLog,
  getMemberByEmail,
} from '../../src/db/queries.ts'
import type { FlightLog, FlightLogInsertRequest } from '../../src/routes/members/models.ts'

dotenv.config()

describe('Db query member tests', () => {
  it('getMember should return member data for a valid email address', async () => {
    const email = 'matti.virtanen@example.com'

    const result = await getMemberByEmail(email)
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      dateOfBirth: expect.any(String),
      updatedAt: expect.any(String),
      memberSince: expect.any(String),
    })
  })

  it('getMember should return undefined for an invalid email address', async () => {
    const email = 'cheddar.cheese@cheezy.com'

    const result = await getMemberByEmail(email)
    expect(result).toBeUndefined()
  })

  it('getMemberRoles should return roles for given valid member', async () => {
    const result = await getMemberRoles(1)
    expect(result).toMatchSnapshot()
  })

  it('getMemberRoles should return empty array for invalid member', async () => {
    const result = await getMemberRoles(-99)
    expect(result).toEqual([])
  })

  it('getMembers should return members', async () => {
    const result = await getMembers()
    expect(result).toMatchSnapshot()
  })
})

describe('Db query Get FlightLog tests', () => {
  it('getAllFlightLogs with no params should return all logs', async () => {
    const result = await getAllFlightLogs({})
    expect(result.length).toEqual(5)
  })

  it('getAllFlightLogs with Captain and copilot should return filtered logs', async () => {
    const result = await getAllFlightLogs({ captain: 'Virtanen', copilot: 'Nieminen' })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('getAllFlightLogs with invalid Captain should not return data', async () => {
    const result = await getAllFlightLogs({ captain: 'Musk' })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs for specified aircraft should match snapshot', async () => {
    const result = await getAllFlightLogs({ aircraft_registration: 'OH-STL' })
    expect(result.length).toEqual(2)
  })

  it('getAllFlightLogs for specific member id should match snapshot', async () => {
    const result = await getAllFlightLogs({ member_id: 1 })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('getAllFlightLogs for start date should match snapshot', async () => {
    const result = await getAllFlightLogs({ startDate: new Date('2025-03-05') })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('getAllFlightLogs for end date should match snapshot', async () => {
    const result: FlightLog[] = await getAllFlightLogs({ endDate: new Date('2025-03-05') })
    expect(result.length).toEqual(5)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })

  it('getAllFlightLogs for end date should not return data', async () => {
    const result = await getAllFlightLogs({ endDate: new Date('2024-03-05') })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs between start and end date should match snapshot', async () => {
    const result = await getAllFlightLogs({
      endDate: new Date('2025-03-05'),
      startDate: new Date('2025-03-03'),
    })
    expect(result.length).toEqual(3)
    expect(result[2]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })
  })
})

describe('Db query insert tests', () => {
  it('insertFlightLog inserts a new flight log to the db, querying using returned flight id returns the row, row can be deleted using flight id', async () => {
    const data: FlightLogInsertRequest = {
      billable_member_id: 1,
      captain: 'Virtanen',
      copilot: 'Nieminen',
      aircraft_registration: 'OH-STL',
      flight_date: '2025-03-05',
      on_block_time_utc: '10:00',
      off_block_time_utc: '10:30',
      takeoff_time_utc: '10:45',
      landing_time_utc: '12:00',
      oil_uplift_litres: 5,
      fuel_uplift_litres: 100,
      persons_on_board: 4,
      number_of_landings: 1,
      night_hours: null,
      instrument_hours: null,
      departure_airport: 'EFHK',
      arrival_airport: 'EFVA',
      flight_type: 'Private',
      billing_remarks: 'Test flight',
      remarks: 'No remarks',
      created_by: 'test_user',
      updated_by: 'test_user',
    }

    const flightId = await insertFlightLog(data)
    expect(flightId).toBeGreaterThan(0)

    const result = await getAllFlightLogs({ flight_id: flightId })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId, 1)
    expect(delRowcount).toEqual(1n)
  })

  afterAll(async () => {
    // Close the pool after all tests
    await closeDb()
  })
})
