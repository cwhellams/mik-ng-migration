import 'dotenv/config'

import {
  deleteFlightLog,
  getFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  getInvoicableFlights,
  insertFlightLog,
  invoiceFlights,
  updateFlightLog,
  updateFlightLogStatus,
} from '../../src/db/flight-log-queries.ts'
import {
  FlightLogStatus,
  FlightType,
  InvoicableFlights,
  type FlightLog,
  type FlightLogMemberRequest,
} from '../../src/routes/flight-log/models.ts'
import { MIKPermissions } from '../../src/routes/members/models.ts'
import { deleteSimplbooksOutbox, expectOutbox1Row } from './__helpers__/simplbooksDbHelpers.ts'
import { SimplbooksEventType } from '../../src/services/simplbooks/models.ts'

describe('Db Get FlightLog tests', () => {
  it('getFlightLog return undefined if not found', async () => {
    const result = await getFlightLog('notfound')
    expect(result).toBeUndefined()
  })

  it('getFlightLog return existing flight', async () => {
    const result = await getFlightLog('da40tndra')
    expect(result).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})

describe('Db query FlightLog tests', () => {
  it('getFlightLogs with no params should return all logs', async () => {
    const result = await getFlightLogs({})
    expect(result.rows).toEqual(205)
    expect(result.logs.length).toEqual(5)
  })

  it('getFlightLogs with Captain and copilot should return filtered logs', async () => {
    const result = await getFlightLogs({ pic: 'Liisa1', crew2: 'Jukka1' })
    expect(result.rows).toEqual(1)
    expect(result.logs.length).toEqual(1)
    expect(result.logs[0]).toMatchSnapshot()
  })

  it('getFlightLogs with 4 crew should return no results', async () => {
    const result = await getFlightLogs({
      pic: 'Anna1',
      crew2: 'Kaisa1',
      crew3: 'Antti1',
      crew4: 'Sanna1',
    })
    expect(result.rows).toEqual(0)
  })

  it('getFlightLogs with invalid Captain should not return data', async () => {
    const result = await getFlightLogs({ pic: 'Maverik' })
    expect(result.rows).toEqual(0)
    expect(result).toEqual({
      limit: 50,
      logs: [],
      page: 0,
      pages: 0,
      rows: 0,
    })
  })

  it('getFlightLogs for specified aircraft should match snapshot', async () => {
    const result = await getFlightLogs({ aircraftRegistration: 'OH-STL' })
    expect(result.rows).toEqual(203)
  })

  it('getFlightLogs for specific member id should match snapshot', async () => {
    const result = await getFlightLogs({ billableMemberId: 'Sanna1' })
    expect(result.rows).toEqual(1)
    expect(result).toMatchSnapshot()
  })

  it('getFlightLogs for start date should match snapshot', async () => {
    const result = await getFlightLogs({
      startDate: '2025-03-04',
    })
    expect(result.rows).toEqual(1)
    expect(result.logs[0]).toMatchSnapshot()
  })

  it('getFlightLogs for end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: '2025-03-06',
    })
    expect(result.rows).toEqual(205)
    expect(result.pages).toEqual(5)
    expect(result.page).toEqual(5)
    expect(result.logs[0]).toMatchSnapshot()
  })

  it('getFlightLogs for end date should not return data', async () => {
    const result = await getFlightLogs({
      endDate: '2000-01-01',
    })
    expect(result.rows).toEqual(0)
    expect(result).toEqual({
      limit: 50,
      logs: [],
      page: 0,
      pages: 0,
      rows: 0,
    })
  })

  it('getFlightLogs between start and end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: '2025-03-06T00:00:00Z',
      startDate: '2025-03-02T09:00:00Z',
    })
    expect(result.rows).toEqual(3)
    expect(result.logs.length).toEqual(3)

    expect(result.logs[2]).toMatchSnapshot()
  })

  it('getFlightLogs with incidents or observations', async () => {
    const result = await getFlightLogs({
      incidentsOrObservations: true,
    })
    expect(result.rows).toEqual(1)
    expect(result.logs?.map(f => f.incidentOrObservations)).toEqual(['Engine stopped briefly'])
  })

  it('getFlightLogTotals returns totals for all ac', async () => {
    const result = await getFlightLogTotals()
    expect(result).toMatchSnapshot()
  })

  it('getFlightLogTotals returns totals for single ac', async () => {
    const result = await getFlightLogTotals('OH-STL')
    expect(result).toMatchSnapshot()
  })
})

describe('Db insert tests', () => {
  it('insertFlightLog inserts a new flight log to the db, querying using returned flight id returns the row, row can be deleted using flight id', async () => {
    const data: FlightLogMemberRequest = {
      aircraftRegistration: 'OH-STL',
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
      numberOfNightLandings: 0,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFVA',
      flightType: FlightType.SCHOOL,
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
      totalTimeInService: 1023.5,
      instrumentFlyingMins: 0,
      nightFlyingMins: 0,
    }

    const flightId = await insertFlightLog(data, {
      memberId: 'Matti1',
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })
    expect(flightId).toHaveLength(9)

    const result = await getFlightLog(flightId)
    expect(result).toMatchSnapshot({
      flightId: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId)
    expect(delRowcount).toEqual(true)
  })

  it('insertFlightLog prevents adding duplicate flights with identical timestamps', async () => {
    const result = await getFlightLog('mikify')
    expect(result).toBeDefined()

    await expect(
      insertFlightLog(result!, {
        memberId: 'Matti1',
        permissions: [MIKPermissions.FLIGHTLOG_USER],
      }),
    ).rejects.toThrow('Duplicate flight log')
  })
})

describe('Db update tests', () => {
  it('updatesFlightLog with remarks and dep aprt then reverts the change', async () => {
    const flightId = 'bLwnAstr0'
    const testObs = 'Observation from test'
    const departureAirport = 'EFNU'

    const originalLog = await getFlightLog(flightId)

    const data: Partial<FlightLog> = {
      incidentOrObservations: testObs,
      departureAirport: departureAirport,
    }

    const user = {
      memberId: 'Liisa1',
      lastName: 'Test',
      email: '',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    }
    const res = await updateFlightLog(flightId, data, user)
    expect(res).toEqual(true)

    const result = await getFlightLog(flightId)
    expect(result?.incidentOrObservations).toEqual(testObs)
    expect(result?.departureAirport).toEqual(departureAirport)

    //cleanup
    data.incidentOrObservations = originalLog?.incidentOrObservations
    data.departureAirport = originalLog?.departureAirport
    user.memberId = originalLog!.updatedBy
    await updateFlightLog(flightId, data, user)
  })
})

describe('Db update status tests', () => {
  it('updatesFlightLogStatus copies ajlb data from the view', async () => {
    const flightId = 'bLwnAstr0'

    const originalLog = await getFlightLog(flightId)
    expect(originalLog?.acTotalFlightTime).toEqual('4783:20')
    expect(originalLog?.ajlbPageNo).toEqual(10)
    expect(originalLog?.ajlbRowNo).toEqual(3)

    const user = {
      memberId: 'Liisa1',
      lastName: 'Test',
      email: '',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    }
    const res = await updateFlightLogStatus(
      flightId,
      FlightLogStatus.NEW,
      FlightLogStatus.VALIDATED,
      {},
      user,
    )
    expect(res).toEqual(true)

    const result = await getFlightLog(flightId)
    expect(result?.acTotalFlightTime).toEqual('4783:20')
    expect(result?.ajlbPageNo).toEqual(10)
    expect(result?.ajlbRowNo).toEqual(3)

    //cleanup
    const cleanup = await updateFlightLogStatus(
      flightId,
      FlightLogStatus.VALIDATED,
      FlightLogStatus.NEW,
      {},
      user,
    )
    expect(cleanup).toEqual(true)

    const cleaned = await getFlightLog(flightId)
    expect(cleaned?.acTotalFlightTime).toEqual('4783:20')
    expect(cleaned?.ajlbPageNo).toEqual(10)
    expect(cleaned?.ajlbRowNo).toEqual(3)
  })
})

describe('Db invoicable FlightLog tests', () => {
  it('getInvoicableFlights returns no results for past date', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2000-01-01',
    })
    expect(result.rows).toEqual(0)
    expect(result.logs.length).toEqual(0)
  })

  it('getInvoicableFlights returns new flights to invoice', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2025-01-01',
    })
    expect(result.rows).toEqual(185)
    expect(result.logs.length).toEqual(35)
  })

  it('getInvoicableFlights with test flights', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2025-01-01',
      flights: InvoicableFlights.TEST_FLIGHT,
    })
    expect(result.rows).toEqual(1)
  })

  it('getInvoicableFlights with ferry flights', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2025-01-01',
      flights: InvoicableFlights.FERRY,
    })
    expect(result.rows).toEqual(1)
  })

  it('getInvoicableFlights for flights with comments', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-P28',
      endDate: '2030-01-01',
      flights: InvoicableFlights.COMMENT,
    })
    expect(result.rows).toEqual(1)
  })

  it('getInvoicableFlights for other flights', async () => {
    const result = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2010-01-10',
      flights: InvoicableFlights.OTHER,
    })
    expect(result.rows).toEqual(4)
  })

  it('invoiceFlights sends flights to outbox', async () => {
    const user = {
      memberId: 'Matti1',
      lastName: 'Test',
      email: '',
      roles: [],
      permissions: [MIKPermissions.INVOICING_ADMIN],
    }

    const preInvoiceFlights = await getFlightLogs({
      aircraftRegistration: 'OH-STL',
      endDate: '2010-01-10',
      status: FlightLogStatus.INVOICED,
    })
    expect(preInvoiceFlights.rows).toEqual(3)

    await deleteSimplbooksOutbox()

    const flights = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2010-01-10',
    })
    expect(flights.rows).toEqual(4)

    const result = await invoiceFlights(flights.logs, user)
    expect(result).toEqual(true)

    const postInvoiceFlights = await getFlightLogs({
      aircraftRegistration: 'OH-STL',
      endDate: '2010-01-10',
      status: FlightLogStatus.INVOICED,
    })
    expect(postInvoiceFlights.rows).toEqual(7)

    const outboxRow = await expectOutbox1Row(SimplbooksEventType.FLIGHT_INVOICE)
    expect(outboxRow.payload).toEqual({ flights: flights.logs })

    //cleanup - revert invoiced flights back to validated
    for (const flight of flights.logs) {
      await updateFlightLogStatus(
        flight.flightId,
        flight.status,
        FlightLogStatus.VALIDATED,
        {},
        user,
      )
    }
  })
})
