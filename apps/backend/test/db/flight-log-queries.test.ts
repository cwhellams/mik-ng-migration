import dotenv from 'dotenv'

import { closeDb } from '../../src/db/connection.ts'
import {
  deleteFlightLog,
  getAllFlightLogs,
  insertFlightLog,
  updateFlightLog,
} from '../../src/db/flight-log-queries.ts'
import type {
  FlightLog,
  FlightLogInsertRequest,
  FlightLogUpdateRequest,
} from '../../src/routes/flight-log/models.ts'
import { MIKRoles } from '../../src/routes/members/models.ts'

dotenv.config()

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
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
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
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for start date should match snapshot', async () => {
    const result = await getAllFlightLogs({ startDate: new Date('2025-03-05') })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for end date should match snapshot', async () => {
    const result: FlightLog[] = await getAllFlightLogs({ endDate: new Date('2025-03-06') })
    expect(result.length).toEqual(5)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for end date should not return data', async () => {
    const result = await getAllFlightLogs({ endDate: new Date('2024-03-05') })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs between start and end date should match snapshot', async () => {
    const result = await getAllFlightLogs({
      endDate: new Date('2025-03-06'),
      startDate: new Date('2025-03-03'),
    })
    expect(result.length).toEqual(3)
    expect(result[2]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
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
      on_block_time_utc: new Date('2025-03-22T11:30:00Z'),
      off_block_time_utc: new Date('2025-03-22T10:30:00Z'),
      takeoff_time_utc: new Date('2025-03-22T10:45:00Z'),
      landing_time_utc: new Date('2025-03-22T11:35:00Z'),
      oil_uplift_litres: 5,
      fuel_uplift_litres: 100,
      persons_on_board: 4,
      number_of_landings: 1,
      night_hours: null,
      instrument_hours: null,
      departure_airport: 'EFHK',
      arrival_airport: 'EFVA',
      flight_type: 'KOU',
      billing_remarks: 'Test flight',
      remarks: 'No remarks',
      created_by: 2,
      updated_by: 2,
      captain_member_id: null,
      copilot_member_id: null,
      is_billable_flight: false,
      non_billing_approved_by_member_id: null,
      non_billing_reason: null,
    }

    const flightId = await insertFlightLog(data)
    expect(flightId).toBeGreaterThan(0)

    const result = await getAllFlightLogs({ flight_id: flightId })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(Number),
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId, { memberId: 1, roles: [MIKRoles.USER] })
    expect(delRowcount).toEqual(1n)
  })
})

describe('Db query update tests', () => {
  it('updatesFlightLog with remarks and dep aprt then reverts the change', async () => {
    const flight_id = 3
    const testRemark = 'Remarks from test'
    const departureAirport = 'EFNU'

    const originalLog = await getAllFlightLogs({ flight_id })
    expect(originalLog.length).toEqual(1)

    const data: FlightLogUpdateRequest = {
      remarks: testRemark,
      departure_airport: departureAirport,
      updated_by: 2,
      updated_at: new Date(),
    }

    const user = {
      memberId: 4,
      roles: [MIKRoles.USER],
    }
    const flightId = await updateFlightLog(flight_id, data, user)
    expect(flightId).toEqual(1n)

    const result = await getAllFlightLogs({ flight_id })
    expect(result.length).toEqual(1)
    expect(result[0].remarks).toEqual(testRemark)
    expect(result[0].departure_airport).toEqual(departureAirport)

    //cleanup
    data.remarks = originalLog[0].remarks
    data.departure_airport = originalLog[0].departure_airport
    data.updated_by = originalLog[0].updated_by
    await updateFlightLog(flight_id, data, user)
  })
  afterAll(async () => {
    // Close the pool after all tests
    await closeDb()
  })
})
