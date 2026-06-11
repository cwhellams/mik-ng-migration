import 'dotenv/config'

import {
  deleteFlightLog,
  getFlightLog,
  getFlightLogs,
  getFlightLogTotals,
  getFlightStats,
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
    expect(result.rows).toEqual(224)
    expect(result.logs.length).toEqual(24)
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
    expect(result.rows).toEqual(20)
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
    expect(result.logs?.map((f) => f.incidentOrObservations)).toEqual(['Engine stopped briefly'])
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
      partiallyBillableFlight: false,
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
      canMakeReservations: false,
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
      canMakeReservations: false,
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
    // The OTHER filter excludes flights below MIN_BILLABLE_FLIGHT_MINS (20 min).
    // Generate 4 VALIDATED flights with 25-min flight time and clean up after.
    // off_block starts at 1276716901 — 1 second after the last mass-data non-NEW
    // on_block (1276716900) so the protected-time-period trigger allows insertion.
    const insertUser = { memberId: 'Pekka1', permissions: [MIKPermissions.FLIGHTLOG_USER] }
    const statusUser = {
      memberId: 'Pekka1',
      lastName: 'Test',
      email: '',
      roles: [],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
      canMakeReservations: false,
    }

    const beforeResult = await getInvoicableFlights({
      aircraftRegistration: 'OH-STL',
      endDate: '2030-01-01',
      flights: InvoicableFlights.OTHER,
    })

    // block duration (off→on) = 35 min; 1-second gap keeps each off_block > prior on_block
    const baseEpoch = 1276716960 // 1276716900 (mass-data last on_block) + 60 s, minute-aligned
    const blockSeconds = 2100 // 35 min
    const flightIds: string[] = []

    for (let i = 0; i < 4; i++) {
      const off = baseEpoch + i * (blockSeconds + 60) // 60-second gap between flights, stays minute-aligned
      const id = await insertFlightLog(
        {
          aircraftRegistration: 'OH-STL',
          picMemberId: 'Pekka1',
          crew2MemberId: null,
          offBlockTimeEpoch: String(off),
          takeoffTimeEpoch: String(off + 300), // 5 min taxi
          landingTimeEpoch: String(off + 1800), // 25 min flight
          onBlockTimeEpoch: String(off + blockSeconds), // 5 min taxi back
          oilUpliftLitres: 0,
          fuelUpliftLitres: 0,
          fuelRemainingLitres: 0,
          personsOnBoard: 1,
          numberOfLandings: 1,
          numberOfNightLandings: 0,
          departureAirport: 'EFHK',
          arrivalAirport: 'EFHK',
          flightType: FlightType.PRIVATE,
          billingRemarks: null,
          personalRemarks: null,
          picRole: 'PIC',
          crew2Role: null,
          crew3MemberId: null,
          crew3Role: null,
          crew4MemberId: null,
          crew4Role: null,
          incidentOrObservations: null,
          totalTimeInService: 1000,
          instrumentFlyingMins: 0,
          nightFlyingMins: 0,
          partiallyBillableFlight: false,
        },
        insertUser,
      )
      await updateFlightLogStatus(
        id,
        FlightLogStatus.NEW,
        FlightLogStatus.VALIDATED,
        {},
        statusUser,
      )
      flightIds.push(id)
    }

    try {
      const afterResult = await getInvoicableFlights({
        aircraftRegistration: 'OH-STL',
        endDate: '2030-01-01',
        flights: InvoicableFlights.OTHER,
      })
      expect(afterResult.rows).toEqual((beforeResult.rows ?? 0) + 4)
    } finally {
      // Revert in reverse insertion order: the protected-time-period trigger blocks
      // reverting flight N to NEW while any later non-NEW flight still exists.
      for (const id of [...flightIds].reverse()) {
        await updateFlightLogStatus(
          id,
          FlightLogStatus.VALIDATED,
          FlightLogStatus.NEW,
          {},
          statusUser,
        )
        await deleteFlightLog(id)
      }
    }
  })

  describe('MIN_BILLABLE filter', () => {
    // Use an epoch safely after the mass-data barrier (last non-NEW on_block = 1276716900).
    // 1278000000 = 21300000 * 60, so it is minute-aligned (the DB enforces % 60 = 0).
    // Each test slot is one hour (3600 s) apart to eliminate any temporal overlap.
    const BASE_EPOCH = 1278000000

    /** Build insertUser compatible with insertFlightLog */
    const makeInsertUser = (memberId: string) => ({
      memberId,
      permissions: [MIKPermissions.FLIGHTLOG_USER],
    })

    /** Build JWTUser-shaped object for updateFlightLogStatus */
    const makeStatusUser = (memberId: string) => ({
      memberId,
      lastName: 'Test',
      email: '',
      roles: [] as string[],
      permissions: [MIKPermissions.FLIGHTLOG_USER],
      canMakeReservations: false,
    })

    /**
     * Insert a single flight and immediately validate it.
     * off_block   = off
     * takeoff     = off + taxiOutSecs
     * landing     = off + taxiOutSecs + flightSecs   (flight_mins = flightSecs / 60)
     * on_block    = off + blockSecs                  (block_mins  = blockSecs  / 60)
     */
    async function insertAndValidate(
      memberId: string,
      off: number,
      blockSecs: number,
      taxiOutSecs: number,
      flightSecs: number,
      departure: string,
      arrival: string,
    ): Promise<string> {
      const id = await insertFlightLog(
        {
          aircraftRegistration: 'OH-STL',
          picMemberId: memberId,
          crew2MemberId: null,
          offBlockTimeEpoch: String(off),
          takeoffTimeEpoch: String(off + taxiOutSecs),
          landingTimeEpoch: String(off + taxiOutSecs + flightSecs),
          onBlockTimeEpoch: String(off + blockSecs),
          oilUpliftLitres: 0,
          fuelUpliftLitres: 0,
          fuelRemainingLitres: 0,
          personsOnBoard: 1,
          numberOfLandings: 1,
          numberOfNightLandings: 0,
          departureAirport: departure,
          arrivalAirport: arrival,
          flightType: FlightType.PRIVATE,
          billingRemarks: null,
          personalRemarks: null,
          picRole: 'PIC',
          crew2Role: null,
          crew3MemberId: null,
          crew3Role: null,
          crew4MemberId: null,
          crew4Role: null,
          incidentOrObservations: null,
          totalTimeInService: 1000,
          instrumentFlyingMins: 0,
          nightFlyingMins: 0,
          partiallyBillableFlight: false,
        },
        makeInsertUser(memberId),
      )
      await updateFlightLogStatus(
        id,
        FlightLogStatus.NEW,
        FlightLogStatus.VALIDATED,
        {},
        makeStatusUser(memberId),
      )
      return id
    }

    /** Revert to NEW (clears the AJLB lock) then delete, in reverse insertion order. */
    async function revertAndDelete(ids: string[], memberId: string): Promise<void> {
      for (const id of [...ids].reverse()) {
        await updateFlightLogStatus(
          id,
          FlightLogStatus.VALIDATED,
          FlightLogStatus.NEW,
          {},
          makeStatusUser(memberId),
        )
        await deleteFlightLog(id)
      }
    }

    it('includes regular pilot local flight when flight_mins is below threshold', async () => {
      // Pekka1: is_training_program_pilot = false → MIN_BILLABLE uses flight_mins.
      // block = 25 min, flight = 15 min (< default 20 min threshold), local EFHK→EFHK.
      const off = BASE_EPOCH
      const id = await insertAndValidate('Pekka1', off, 1500, 300, 900, 'EFHK', 'EFHK')
      try {
        const result = await getInvoicableFlights({
          aircraftRegistration: 'OH-STL',
          endDate: '2030-01-01',
          flights: InvoicableFlights.MIN_BILLABLE,
        })
        expect(result.logs.some((l) => l.flightId === id)).toBe(true)
      } finally {
        await revertAndDelete([id], 'Pekka1')
      }
    })

    it('includes training pilot local flight when block_mins is below threshold', async () => {
      // Matti1: is_training_program_pilot = true → MIN_BILLABLE uses block_mins.
      // block = 18 min (< 20 threshold), flight = 14 min, local EFHK→EFHK.
      // Ensures the CASE expression selects block_mins for training pilots.
      const off = BASE_EPOCH + 3600
      const id = await insertAndValidate('Matti1', off, 1080, 60, 840, 'EFHK', 'EFHK')
      try {
        const result = await getInvoicableFlights({
          aircraftRegistration: 'OH-STL',
          endDate: '2030-01-01',
          flights: InvoicableFlights.MIN_BILLABLE,
        })
        expect(result.logs.some((l) => l.flightId === id)).toBe(true)
      } finally {
        await revertAndDelete([id], 'Matti1')
      }
    })

    it('excludes training pilot local flight when block_mins meets threshold despite short flight_mins', async () => {
      // Matti1: is_training_program_pilot = true → MIN_BILLABLE uses block_mins.
      // block = 25 min (>= 20 threshold), flight = 15 min (< 20).
      // A naive flight_mins check would flag this flight; block_mins check correctly excludes it.
      const off = BASE_EPOCH + 7200
      const id = await insertAndValidate('Matti1', off, 1500, 300, 900, 'EFHK', 'EFHK')
      try {
        const result = await getInvoicableFlights({
          aircraftRegistration: 'OH-STL',
          endDate: '2030-01-01',
          flights: InvoicableFlights.MIN_BILLABLE,
        })
        expect(result.logs.some((l) => l.flightId === id)).toBe(false)
      } finally {
        await revertAndDelete([id], 'Matti1')
      }
    })

    it('excludes regular pilot cross-country flight even when flight_mins is below threshold', async () => {
      // Pekka1: departure EFHK ≠ arrival EFTU → cross-country, excluded from MIN_BILLABLE.
      // flight = 15 min (< 20 threshold), but the local-flight restriction applies.
      const off = BASE_EPOCH + 10800
      const id = await insertAndValidate('Pekka1', off, 1500, 300, 900, 'EFHK', 'EFTU')
      try {
        const result = await getInvoicableFlights({
          aircraftRegistration: 'OH-STL',
          endDate: '2030-01-01',
          flights: InvoicableFlights.MIN_BILLABLE,
        })
        expect(result.logs.some((l) => l.flightId === id)).toBe(false)
      } finally {
        await revertAndDelete([id], 'Pekka1')
      }
    })
  })

  it('invoiceFlights sends flights to outbox', async () => {
    const user = {
      memberId: 'Matti1',
      lastName: 'Test',
      email: '',
      roles: [],
      permissions: [MIKPermissions.INVOICING_ADMIN],
      canMakeReservations: false,
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

    await invoiceFlights(flights.logs)

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

describe('Db Flight statistics', () => {
  it('get flights statistics with no flights', async () => {
    const result = await getFlightStats('k1mnimda', true)
    expect(result).toEqual([])
  })
  it.skip('get flights statistics with single plane', async () => {
    const result = await getFlightStats('Matti1', true)
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-STL',
        landings12month: 1,
        landings1month: 0,
        landings3month: 0,
        landings6month: 0,
        lastFlightId: 'bLwnAstr0',
        lastTakeoffTimeUtc: '2025-03-03T10:30:00.000Z',
        time12month: 90,
        time1month: 0,
        time3month: 0,
        time6month: 0,
        totalFlightMins: 195,
        totalFlights: 2,
        totalLandings: 2,
      },
    ])
  })

  it('get flights statistics with multiple planes including inactive planes', async () => {
    const result = await getFlightStats('Jukka1', false)
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-P28',
        landings12month: 0,
        landings1month: 0,
        landings3month: 0,
        landings6month: 0,
        lastFlightId: 'fi_inst3',
        lastTakeoffTimeUtc: '2025-05-05T09:10:00.000Z',
        time12month: 0,
        time1month: 0,
        time3month: 0,
        time6month: 0,
        totalFlightMins: 255,
        totalFlights: 3,
        totalLandings: 5,
      },
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
    ])
    expect(result.map((item) => item.aircraftRegistration)).toEqual(['OH-P28', 'OH-IHQ'])
  })

  it.skip('get flights statistics with multiple planes where only one is active', async () => {
    const result = await getFlightStats('Jukka1', true)
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-IHQ',
        landings12month: 2,
        landings1month: 0,
        landings3month: 0,
        landings6month: 0,
        lastFlightId: 'efnu4evr',
        lastTakeoffTimeUtc: '2025-03-02T09:20:00.000Z',
        time12month: 120,
        time1month: 0,
        time3month: 0,
        time6month: 0,
        totalFlightMins: 120,
        totalFlights: 1,
        totalLandings: 2,
      },
    ])
  })
})
