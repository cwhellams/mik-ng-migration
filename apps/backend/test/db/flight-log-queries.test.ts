import 'dotenv/config'

import {
  deleteFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  insertFlightLog,
  updateFlightLog,
} from '../../src/db/flight-log-queries.ts'
import type { FlightLog, FlightLogMemberRequest } from '../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../src/routes/members/models.ts'

describe('Db query Get FlightLog tests', () => {
  it('getAllFlightLogs with no params should return all logs', async () => {
    const result = await getFlightLogs({})
    expect(result.length).toEqual(5)
  })

  it('getAllFlightLogs with Captain and copilot should return filtered logs', async () => {
    const result = await getFlightLogs({ pic: 'Liisa1', crew2: 'Jukka1' })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
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
    const result = await getFlightLogs({ aircraftRegistration: 'OH-STL' })
    expect(result.length).toEqual(3)
  })

  it('getAllFlightLogs for specific member id should match snapshot', async () => {
    const result = await getFlightLogs({ billableMemberId: 'Sanna1' })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('getAllFlightLogs for start date should match snapshot', async () => {
    const result = await getFlightLogs({
      startDate: '2025-03-04',
    })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('getAllFlightLogs for end date should match snapshot', async () => {
    const result: FlightLog[] = await getFlightLogs({
      endDate: '2025-03-06',
    })
    expect(result.length).toEqual(5)
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })

  it('getAllFlightLogs for end date should not return data', async () => {
    const result = await getFlightLogs({
      endDate: '2024-03-05',
    })
    expect(result.length).toEqual(0)
    expect(result).toEqual([])
  })

  it('getAllFlightLogs between start and end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: '2025-03-06T00:00:00Z',
      startDate: '2025-03-02T09:00:00Z',
    })
    expect(result.length).toEqual(3)

    expect(result[2]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
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
    const data: FlightLogMemberRequest = {
      aircraftRegistration: 'OH-STL',
      billableMemberId: 'Matti1',
      picMemberId: 'Liisa1',
      crew2MemberId: 'Pekka1',
      onBlockTimeEpoch: '1741584000',
      offBlockTimeEpoch: '1741579500',
      takeoffTimeEpoch: '1741580100',
      landingTimeEpoch: '1741583700',
      oilUpliftLitres: 5,
      fuelUpliftLitres: 100,
      personsOnBoard: 4,
      numberOfLandings: 1,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFVA',
      flightType: 'KOU',
      billingRemarks: 'Test flight',
      personalRemarks: 'No remarks',
      picRole: 'FE',
      crew2Role: null,
      crew3MemberId: null,
      crew3Role: null,
      crew4MemberId: null,
      crew4Role: null,
      fuelRemainingLitres: 22,
      incidentOrObservations: null,
      privOrComFlight: 'P',
      totalTimeInService: 1023.5,
      instrumentFlyingMins: 0,
      nightFlyingMins: 0,
    }

    const flightId = await insertFlightLog(data, {
      memberId: 'Matti1',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })
    expect(flightId).toHaveLength(9)

    const result = await getFlightLogs({ flightId: flightId })
    expect(result.length).toEqual(1)
    expect(result[0]).toMatchSnapshot({
      flightId: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId)
    expect(delRowcount).toEqual(1n)
  })
})

describe('Db query update tests', () => {
  it('updatesFlightLog with remarks and dep aprt then reverts the change', async () => {
    const flightId = 'bLwnAstr0'
    const testObs = 'Observation from test'
    const departureAirport = 'EFNU'

    const originalLog = await getFlightLogs({ flightId })
    expect(originalLog.length).toEqual(1)

    const data: Partial<FlightLog> = {
      incidentOrObservations: testObs,
      departureAirport: departureAirport,
    }

    const user = {
      memberId: 'Liisa1',
      email: '',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    }
    const res = await updateFlightLog(flightId, data, user)
    expect(res).toEqual(1n)

    const result = await getFlightLogs({ flightId })
    expect(result.length).toEqual(1)
    expect(result[0].incidentOrObservations).toEqual(testObs)
    expect(result[0].departureAirport).toEqual(departureAirport)

    //cleanup
    data.incidentOrObservations = originalLog[0].incidentOrObservations
    data.departureAirport = originalLog[0].departureAirport
    user.memberId = originalLog[0].updatedBy
    await updateFlightLog(flightId, data, user)
  })
})
