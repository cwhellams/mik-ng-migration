import dotenv from 'dotenv'

import { closeDb } from '../../src/db/connection.ts'
import {
  deleteFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  insertFlightLog,
  updateFlightLog,
} from '../../src/db/flight-log-queries.ts'
import type {
  FlightLog,
  FlightLogInsertRequest,
  FlightLogUpdateRequest,
} from '../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../src/routes/members/models.ts'
import { generateShortId } from '../../src/util/nanoId.ts'

dotenv.config()

describe('Db query Get FlightLog tests', () => {
  it('getAllFlightLogs with no params should return all logs', async () => {
    const result = await getFlightLogs({})
    expect(result.length).toEqual(5)
  })

  it('getAllFlightLogs with Captain and copilot should return filtered logs', async () => {
    const result = await getFlightLogs({ pic: 'Liisa1', crew2: 'Jukka1' })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs with 4 crew should return no results', async () => {
    const result = await getFlightLogs({
      pic: 'Anna1',
      crew2: 'Kaisa1',
      crew3: 'Antti1',
      crew4: 'Sanna1',
    })
    expect(result.length).toEqual(0)
  })

  it('getAllFlightLogs with invalid Captain should not return data', async () => {
    const result = await getFlightLogs({ pic: 'Maverik' })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs for specified aircraft should match snapshot', async () => {
    const result = await getFlightLogs({ aircraft_registration: 'OH-STL' })
    expect(result.length).toEqual(3)
  })

  it('getAllFlightLogs for specific member id should match snapshot', async () => {
    const result = await getFlightLogs({ billable_member_id: 'Matti1' })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for start date should match snapshot', async () => {
    const result = await getFlightLogs({
      startDate: BigInt(new Date('2025-03-04').getTime() / 1000),
    })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for end date should match snapshot', async () => {
    const result: FlightLog[] = await getFlightLogs({
      endDate: BigInt(new Date('2025-03-06').getTime() / 1000),
    })
    expect(result.length).toEqual(5)
    expect(result[0]).toMatchSnapshot({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getAllFlightLogs for end date should not return data', async () => {
    const result = await getFlightLogs({
      endDate: BigInt(new Date('2024-03-05').getTime() / 1000),
    })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs between start and end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: BigInt(new Date('2025-03-06T00:00:00Z').getTime() / 1000),
      startDate: BigInt(new Date('2025-03-02T09:00:00Z').getTime() / 1000),
    })
    expect(result.length).toEqual(3)

    expect(result[2]).toMatchSnapshot({
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
  })

  it('getFlightLogTotals returns totals for all ac', async () => {
    const result = await getFlightLogTotals()
    expect(result).toMatchSnapshot()
  })

  it('getFlightLogTotals returns totals for all ac', async () => {
    const result = await getFlightLogTotals('OH-STL')
    expect(result).toMatchSnapshot()
  })
})

describe('Db query insert tests', () => {
  it('insertFlightLog inserts a new flight log to the db, querying using returned flight id returns the row, row can be deleted using flight id', async () => {
    const data: FlightLogInsertRequest = {
      flight_id: generateShortId(),
      aircraft_registration: 'OH-STL',
      billable_member_id: 'Matti1',
      pic_member_id: 'Liisa1',
      crew2_member_id: 'Pekka1',
      on_block_time_epoch: '1741584000',
      off_block_time_epoch: '1741579500',
      takeoff_time_epoch: '1741580100',
      landing_time_epoch: '1741583700',
      oil_uplift_litres: 5,
      fuel_uplift_litres: 100,
      persons_on_board: 4,
      number_of_landings: 1,
      departure_airport: 'EFHK',
      arrival_airport: 'EFVA',
      flight_type: 'KOU',
      billing_remarks: 'Test flight',
      personal_remarks: 'No remarks',
      is_billable_flight: false,
      non_billing_reason: null,
      pic_role: 'FE',
      crew2_role: null,
      crew3_member_id: null,
      crew3_role: null,
      crew4_member_id: null,
      crew4_role: null,
      fuel_remaining_litres: 22,
      incident_or_observations: null,
      priv_or_com_flight: 'P',
      ajlb_seq_no: 1,
      ajlb_blank_rows_before: 0,
      total_time_in_service: 1023.5,
      instrument_flying_mins: 0,
      night_flying_mins: 0,
    }

    const flightId = await insertFlightLog(data, {
      memberId: 'Matti1',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })
    expect(flightId).toHaveLength(9)

    const result = await getFlightLogs({ flight_id: flightId })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flight_id: expect.any(String),
      created_at: expect.any(Date),
      updated_at: expect.any(Date),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId)
    expect(delRowcount).toEqual(1n)
  })
})

describe('Db query update tests', () => {
  it('updatesFlightLog with remarks and dep aprt then reverts the change', async () => {
    const flight_id = 'bLwnAstr0'
    const testObs = 'Observation from test'
    const departureAirport = 'EFNU'

    const originalLog = await getFlightLogs({ flight_id })
    expect(originalLog.length).toEqual(1)

    const data: FlightLogUpdateRequest = {
      incident_or_observations: testObs,
      departure_airport: departureAirport,
    }

    const user = {
      memberId: 'Liisa1',
      email: '',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    }
    const flightId = await updateFlightLog(flight_id, data, user)
    expect(flightId).toEqual(1n)

    const result = await getFlightLogs({ flight_id })
    expect(result.length).toEqual(1)
    expect(result[0].incident_or_observations).toEqual(testObs)
    expect(result[0].departure_airport).toEqual(departureAirport)

    //cleanup
    data.incident_or_observations = originalLog[0].incident_or_observations
    data.departure_airport = originalLog[0].departure_airport
    user.memberId = originalLog[0].updated_by
    await updateFlightLog(flight_id, data, user)
  })

  afterAll(async () => {
    // Close the pool after all tests
    await closeDb()
  })
})
