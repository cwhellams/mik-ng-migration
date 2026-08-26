import 'dotenv/config'

import {
  countFlightLogsForExport,
  deleteFlightLog,
  getFlightLog,
  getFlightLogAuditTrail,
  getFlightLogPageForMins,
  getFlightLogs,
  getFlightLogsForExport,
  getFlightLogTotals,
  getFlightStats,
  getInvoicableFlights,
  getOverlappingFlightLogs,
  insertFlightLog,
  invoiceFlights,
  updateFlightLog,
  updateFlightLogStatus,
} from '../../src/db/flight-log-queries.ts'
import { createDefect } from '../../src/db/defect-queries.ts'
import { db } from '../../src/db/connection.ts'
import {
  FlightLogStatus,
  FlightType,
  InvoicableFlights,
  type FlightLog,
  type FlightLogMemberRequest,
} from '@mik/contracts/flight-log'
import { MIKPermissions } from '@mik/contracts/members'
import { deleteSimplbooksOutbox, expectOutbox1Row } from './__helpers__/simplbooksDbHelpers.ts'
import { SimplbooksEventType } from '../../src/services/simplbooks/models.ts'

const normalizeLandingTotals = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeLandingTotals)
  }
  if (value && typeof value === 'object') {
    const normalized = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeLandingTotals(nested)]),
    ) as Record<string, unknown>
    if (
      Object.prototype.hasOwnProperty.call(normalized, 'acTotalLandings') &&
      (typeof normalized.acTotalLandings === 'number' || normalized.acTotalLandings === null)
    ) {
      normalized.acTotalLandings = 0
    }
    return normalized
  }
  return value
}

describe('Db Get FlightLog tests', () => {
  it('getFlightLog return undefined if not found', async () => {
    const result = await getFlightLog('notfound')
    expect(result).toBeUndefined()
  })

  it('getFlightLog return existing flight', async () => {
    const result = await getFlightLog('da40tndra')
    expect(normalizeLandingTotals(result)).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})

describe('Db query FlightLog tests', () => {
  it('getFlightLogs with no params should return all logs', async () => {
    const result = await getFlightLogs({})
    // +3 for V330's eff1fl/eff2fl/eff4fl. No page requested, so this defaults to the
    // last page (page 6 of 50): 286 - 5*50 = 36 rows.
    expect(result.rows).toEqual(286)
    expect(result.logs.length).toEqual(36)
  })

  it('getFlightLogs with Captain and copilot should return filtered logs', async () => {
    const result = await getFlightLogs({ pic: 'Liisa1', crew2: 'Jukka1' })
    expect(result.rows).toEqual(1)
    expect(result.logs.length).toEqual(1)
    expect(normalizeLandingTotals(result.logs[0])).toMatchSnapshot()
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
      pageStartFlightMins: null,
    })
  })

  it('getFlightLogs for specified aircraft should match snapshot', async () => {
    const result = await getFlightLogs({ aircraftRegistration: 'OH-STL' })
    // +3 for V330's eff1fl/eff2fl/eff4fl.
    expect(result.rows).toEqual(249)
  })

  it('getFlightLogs populates acTotalLandings for a NEW (unvalidated) flight, not just validated ones', async () => {
    // ajlb_total_landings (the frozen column) is only ever set for VALIDATED
    // flights; a NEW flight's total must fall back to totals.ac_total_landings
    // (the live-computed running total), same as acTotalFlightMins/Time already do.
    const result = await getFlightLogs({ flightId: 'mikify' })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].status).toEqual('NEW')
    expect(result.logs[0].acTotalLandings).not.toBeNull()
  })

  it('getFlightLogs for specific member id should match snapshot', async () => {
    const result = await getFlightLogs({ billableMemberId: 'Sanna1' })
    expect(result.rows).toEqual(1)
    expect(normalizeLandingTotals(result)).toMatchSnapshot()
  })

  it('getFlightLogs for start date should match snapshot', async () => {
    const result = await getFlightLogs({
      startDate: '2025-03-04',
    })
    // +3 for V330's eff1fl/eff2fl/eff4fl (all 2026, well inside this range).
    expect(result.rows).toEqual(66)
    expect(normalizeLandingTotals(result.logs[0])).toMatchSnapshot()
  })

  it('getFlightLogs for end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: '2025-03-06',
    })
    expect(result.rows).toEqual(222)
    expect(result.pages).toEqual(5)
    expect(result.page).toEqual(5)
    expect(normalizeLandingTotals(result.logs[0])).toMatchSnapshot()
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
      pageStartFlightMins: null,
    })
  })

  it('getFlightLogs between start and end date should match snapshot', async () => {
    const result = await getFlightLogs({
      endDate: '2025-03-06T00:00:00Z',
      startDate: '2025-03-02T09:00:00Z',
    })
    expect(result.rows).toEqual(4)
    expect(result.logs.length).toEqual(4)

    expect(normalizeLandingTotals(result.logs[2])).toMatchSnapshot()
  })

  it('getFlightLogs with incidents or observations', async () => {
    const result = await getFlightLogs({
      incidentsOrObservations: true,
    })
    expect(result.rows).toEqual(1)
    expect(result.logs?.map((f) => f.incidentOrObservations)).toEqual(['Engine stopped briefly'])
  })

  it('getFlightLogs with ajlb paging resolves pageStartFlightMins from the previous page without erroring', async () => {
    // OH-STL ajlb_seq_no 3 (rows_per_page=5, start_page=500): page 500 holds
    // pob25a01/b01/a02/c01/a03, whose cumulative ac_total_flight_mins ends at
    // 700405 on pob25a03 (row 5, the last row of page 500). Page numbers step
    // by 2 (500, 502, 504, ...), matching flight.vw_flight_logs' page_number
    // formula and the frontend's own pagination - so this also guards against
    // the boundary lookup regressing to an off-by-one (`page - 1` instead of
    // `page - 2`) that would silently return pageStartFlightMins: null for
    // every page after the first.
    const result = await getFlightLogs({
      aircraftRegistration: 'OH-STL',
      ajlbSeqNo: 3,
      page: 502,
    })
    expect(result.pageStartFlightMins).toEqual(700405)
  })

  it('getFlightLogs keeps pageStartFlightMins correct across a page boundary', async () => {
    // Insert two consecutive NEW flights on OH-STL ajlb_seq_no 3, positioned
    // between the existing pob25a02 (1737532800, cumulative total 700240) and
    // pob25c01 (1738742400) rows. Both land as the new rows 4 and 5 of page 500,
    // pushing pob25c01/pob25a03 onto page 502, so their combined flight_mins
    // (30 + 45) must be fully accounted for in the page-500 boundary before
    // page 502 begins - i.e. 700240 + 30 + 45.
    //
    // These two flights used to share an off_block_time_epoch, to also cover the
    // ROWS-frame tiebreaker added in V1201. V1540 (issue #896) now rejects any
    // overlap on the same aircraft, and two flights sharing an off-block time
    // always overlap, so that state can no longer be created through an insert.
    // The V1201 tiebreaker still guards legacy rows that predate V1540.
    const baseFlight = {
      aircraftRegistration: 'OH-STL',
      picMemberId: 'Liisa1',
      offBlockTimeEpoch: '1737999960',
      takeoffTimeEpoch: '1738000860',
      oilUpliftLitres: 1,
      fuelUpliftLitres: 20,
      personsOnBoard: 1,
      numberOfLandings: 1,
      numberOfNightLandings: 0,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFHK',
      flightType: FlightType.SCHOOL,
      billingRemarks: null,
      personalRemarks: 'ajlb tie-break test',
      picRole: 'PIC' as const,
      crew2MemberId: null,
      crew2Role: null,
      crew3MemberId: null,
      crew3Role: null,
      crew4MemberId: null,
      crew4Role: null,
      fuelRemainingLitres: 20,
      incidentOrObservations: null,
      totalTimeInService: 1,
      instrumentFlyingMins: 0,
      nightFlyingMins: 0,
      partiallyBillableFlight: false,
    }
    const insertUser = { memberId: 'Matti1', permissions: [MIKPermissions.FLIGHTLOG_USER] }

    const flightIdA = await insertFlightLog(
      {
        ...baseFlight,
        landingTimeEpoch: '1738002660',
        onBlockTimeEpoch: '1738003560',
      } as FlightLogMemberRequest,
      insertUser,
    )
    // starts back-to-back with flight A's on-block time, 45 flight minutes
    const flightIdB = await insertFlightLog(
      {
        ...baseFlight,
        offBlockTimeEpoch: '1738003560',
        takeoffTimeEpoch: '1738004460',
        landingTimeEpoch: '1738007160',
        onBlockTimeEpoch: '1738008060',
      } as FlightLogMemberRequest,
      insertUser,
    )

    try {
      const result = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 502,
      })
      expect(result.pageStartFlightMins).toEqual(700240 + 30 + 45)
    } finally {
      await deleteFlightLog(flightIdA, insertUser.memberId)
      await deleteFlightLog(flightIdB, insertUser.memberId)
    }
  })

  it('getFlightLogs resolves pageStartFlightMins across a page with zero flights on it', async () => {
    // OH-STL ajlb_seq_no 3's live region starts right after pob25a03 (cumulative
    // 700405, the last row of page 500). flightA (60 min) becomes the sole flight
    // on page 502 (row 1); a defect anchored to it, sized to consume the
    // remaining 4 rows of page 502 plus all 5 rows of page 504 (9 rows total),
    // leaves page 504 with NO flights at all; flightB (30 min) then lands on
    // page 506. Looking up page 506's pageStartFlightMins used to filter for
    // "page = 504" specifically, find nothing there, and silently fall back to
    // null -- which resets the frontend's lower bound to -1 and made it
    // re-render every earlier note/defect a second time on page 506. It must
    // instead find flightA's total (700465) on the nearest earlier page that
    // actually has one.
    const baseFlight = {
      aircraftRegistration: 'OH-STL',
      picMemberId: 'Liisa1',
      oilUpliftLitres: 1,
      fuelUpliftLitres: 20,
      personsOnBoard: 1,
      numberOfLandings: 1,
      numberOfNightLandings: 0,
      departureAirport: 'EFHK',
      arrivalAirport: 'EFHK',
      flightType: FlightType.SCHOOL,
      billingRemarks: null,
      personalRemarks: 'empty-page pageStartFlightMins test',
      picRole: 'PIC' as const,
      crew2MemberId: null,
      crew2Role: null,
      crew3MemberId: null,
      crew3Role: null,
      crew4MemberId: null,
      crew4Role: null,
      fuelRemainingLitres: 20,
      incidentOrObservations: null,
      totalTimeInService: 1,
      instrumentFlyingMins: 0,
      nightFlyingMins: 0,
      partiallyBillableFlight: false,
    }
    const insertUser = { memberId: 'Matti1', permissions: [MIKPermissions.FLIGHTLOG_USER] }

    const flightIdA = await insertFlightLog(
      {
        ...baseFlight,
        offBlockTimeEpoch: '1784109600', // 2026-07-15T10:00:00Z
        takeoffTimeEpoch: '1784109900',
        landingTimeEpoch: '1784113500', // 60 min flight
        onBlockTimeEpoch: '1784113800',
      } as FlightLogMemberRequest,
      insertUser,
    )
    const flightIdB = await insertFlightLog(
      {
        ...baseFlight,
        offBlockTimeEpoch: '1784196000', // 2026-07-16T10:00:00Z
        takeoffTimeEpoch: '1784196300',
        landingTimeEpoch: '1784198100', // 30 min flight
        onBlockTimeEpoch: '1784198400',
      } as FlightLogMemberRequest,
      insertUser,
    )

    const defect = await createDefect(
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        flightId: null,
        description: 'fills the rest of page 502 plus all of page 504',
        flightMins: 700405 + 60, // anchors to flightA (700465), not flightB
        rows: 9,
      },
      'Matti1',
    )

    try {
      const result = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 506,
      })
      expect(result.pageStartFlightMins).toEqual(700405 + 60)
    } finally {
      await db.deleteFrom('flight.defect').where('defectId', '=', defect.defectId).execute()
      await deleteFlightLog(flightIdA, insertUser.memberId)
      await deleteFlightLog(flightIdB, insertUser.memberId)
    }
  })

  it('getFlightLogs splits a note/defect that spans a page boundary across pageItemRows', async () => {
    // OH-STL ajlb_seq_no 3's live region starts right after pob25a03 (cumulative
    // 700405, the last row of page 500). flightA (60 min) becomes the sole flight
    // on page 502 (row 1, absolute row 6). A defect anchored right after it, with
    // rows: 6 (absolute rows 7-12), only has 4 rows of room left on page 502
    // (rows 2-5) -- its content row (the first of its own 6) lands there, but the
    // remaining 2 rows must carry onto page 504 as blank continuation, matching
    // flight.vw_ajlb_live_rows' physical-row breakdown instead of either
    // overflowing page 502 past 5 rows or dropping the carried-over rows entirely.
    const flightIdA = await insertFlightLog(
      {
        aircraftRegistration: 'OH-STL',
        picMemberId: 'Liisa1',
        oilUpliftLitres: 1,
        fuelUpliftLitres: 20,
        personsOnBoard: 1,
        numberOfLandings: 1,
        numberOfNightLandings: 0,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        flightType: FlightType.SCHOOL,
        billingRemarks: null,
        personalRemarks: 'pageItemRows split test',
        picRole: 'PIC' as const,
        crew2MemberId: null,
        crew2Role: null,
        crew3MemberId: null,
        crew3Role: null,
        crew4MemberId: null,
        crew4Role: null,
        fuelRemainingLitres: 20,
        incidentOrObservations: null,
        totalTimeInService: 1,
        instrumentFlyingMins: 0,
        nightFlyingMins: 0,
        partiallyBillableFlight: false,
        offBlockTimeEpoch: '1784282400', // 2026-07-17T10:00:00Z
        takeoffTimeEpoch: '1784282700',
        landingTimeEpoch: '1784286300', // 60 min flight
        onBlockTimeEpoch: '1784286600',
      } as FlightLogMemberRequest,
      { memberId: 'Matti1', permissions: [MIKPermissions.FLIGHTLOG_USER] },
    )

    const defect = await createDefect(
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        flightId: null,
        description: 'spans page 502 into page 504',
        flightMins: 700405 + 60, // anchors right after flightA
        rows: 6,
      },
      'Matti1',
    )

    try {
      const page502 = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 502,
      })
      expect(page502.logs).toHaveLength(1)
      expect(page502.pageItemRows).toEqual([
        { rowNumber: 2, itemType: 'defect', itemId: defect.defectId, isContentRow: true },
        { rowNumber: 3, itemType: 'defect', itemId: defect.defectId, isContentRow: false },
        { rowNumber: 4, itemType: 'defect', itemId: defect.defectId, isContentRow: false },
        { rowNumber: 5, itemType: 'defect', itemId: defect.defectId, isContentRow: false },
      ])

      // Page 504 also picks up whatever real fixture flights land on the rows after
      // the carried-over continuation (rows 3-5) -- irrelevant here, only the
      // continuation's own row placement (rows 1-2) is under test.
      const page504 = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 504,
      })
      expect(page504.pageItemRows).toEqual([
        { rowNumber: 1, itemType: 'defect', itemId: defect.defectId, isContentRow: false },
        { rowNumber: 2, itemType: 'defect', itemId: defect.defectId, isContentRow: false },
      ])
    } finally {
      await db.deleteFrom('flight.defect').where('defectId', '=', defect.defectId).execute()
      await deleteFlightLog(flightIdA, 'Matti1')
    }
  })

  it("getFlightLogPageForMins resolves an own-row item to its actual page, not its anchor flight's", async () => {
    // OH-STL ajlb_seq_no 3's rows_per_page is 5. flightA becomes the sole flight
    // on page 502 (row 1). A filler defect (rows: 4) anchored right after it
    // fills the rest of page 502 (rows 2-5) exactly. Neither item is a flight,
    // so they don't move the running flight-time total -- the flightMins-only
    // heuristic (no item given) would still match flightA (the last/only flight
    // whose cumulative total reaches these flightMins) and return its page,
    // 502. But a further defect anchored after the filler has nowhere left on
    // page 502 and actually lands on page 504 -- the bug this test guards
    // against is exactly that mismatch.
    const flightIdA = await insertFlightLog(
      {
        aircraftRegistration: 'OH-STL',
        picMemberId: 'Liisa1',
        oilUpliftLitres: 1,
        fuelUpliftLitres: 20,
        personsOnBoard: 1,
        numberOfLandings: 1,
        numberOfNightLandings: 0,
        departureAirport: 'EFHK',
        arrivalAirport: 'EFHK',
        flightType: FlightType.SCHOOL,
        billingRemarks: null,
        personalRemarks: 'page-for-mins overflow test',
        picRole: 'PIC' as const,
        crew2MemberId: null,
        crew2Role: null,
        crew3MemberId: null,
        crew3Role: null,
        crew4MemberId: null,
        crew4Role: null,
        fuelRemainingLitres: 20,
        incidentOrObservations: null,
        totalTimeInService: 1,
        instrumentFlyingMins: 0,
        nightFlyingMins: 0,
        partiallyBillableFlight: false,
        offBlockTimeEpoch: '1784282400', // 2026-07-17T10:00:00Z
        takeoffTimeEpoch: '1784282700',
        landingTimeEpoch: '1784286300', // 60 min flight
        onBlockTimeEpoch: '1784286600',
      } as FlightLogMemberRequest,
      { memberId: 'Matti1', permissions: [MIKPermissions.FLIGHTLOG_USER] },
    )

    const filler = await createDefect(
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        flightId: null,
        description: 'fills the rest of page 502',
        flightMins: 700405 + 60, // anchors to flightA, same as its own total
        rows: 4,
      },
      'Matti1',
    )

    const overflow = await createDefect(
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        flightId: null,
        description: 'has nowhere left on page 502',
        flightMins: 700405 + 60,
        rows: 1,
      },
      'Matti1',
    )

    try {
      const heuristicOnly = await getFlightLogPageForMins('OH-STL', 3, overflow.flightMins)
      expect(heuristicOnly).toBe(502) // the anchor flight's page -- known-wrong for this item

      const resolved = await getFlightLogPageForMins('OH-STL', 3, overflow.flightMins, {
        itemType: 'defect',
        itemId: overflow.defectId,
      })
      expect(resolved).toBe(504) // where it actually landed

      const page502 = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 502,
      })
      expect(page502.pageItemRows?.some((row) => row.itemId === overflow.defectId)).toBe(false)

      const page504 = await getFlightLogs({
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        page: 504,
      })
      expect(page504.pageItemRows).toEqual([
        { rowNumber: 1, itemType: 'defect', itemId: overflow.defectId, isContentRow: true },
      ])
    } finally {
      await db
        .deleteFrom('flight.defect')
        .where('defectId', 'in', [filler.defectId, overflow.defectId])
        .execute()
      await deleteFlightLog(flightIdA, 'Matti1')
    }
  })

  it('sorts an item recorded exactly at the baseline before the next live flight, not after', async () => {
    // Mirrors the real bug: a pre-flight defect recorded with flightMins exactly
    // equal to the baseline (i.e. found before any new flight has flown since the
    // last validated one) must stay positioned before the chronologically-first
    // live flight, not get anchored to (and printed after) it just because that
    // flight's own ending total also happens to satisfy ">= flightMins". OH-STL
    // ajlb_seq_no 3's validated_total_flight_mins (the true baseline) is 700000;
    // its first live (NEW-status) fixture flight, pob25a01, starts exactly there.
    const defect = await createDefect(
      {
        aircraftRegistration: 'OH-STL',
        ajlbSeqNo: 3,
        flightId: null,
        description: 'found on the ramp before the earliest live flight',
        flightMins: 700000,
        rows: 1,
      },
      'Matti1',
    )

    try {
      const rows = await db
        .selectFrom('flight.vwAjlbLiveSequence')
        .select(['itemType', 'itemId', 'ajlbRowNumber'])
        .where('aircraftRegistration', '=', 'OH-STL')
        .where('ajlbSeqNo', '=', 3)
        .orderBy('ajlbRowNumber')
        .execute()

      const defectRow = rows.find((r) => r.itemId === defect.defectId)
      const firstFlightRow = rows.find((r) => r.itemType === 'flight')
      expect(defectRow).toBeDefined()
      expect(firstFlightRow).toBeDefined()
      expect(Number(defectRow!.ajlbRowNumber)).toBeLessThan(Number(firstFlightRow!.ajlbRowNumber))
    } finally {
      await db.deleteFrom('flight.defect').where('defectId', '=', defect.defectId).execute()
    }
  })

  it('getFlightLogTotals returns totals for all ac', async () => {
    const result = await getFlightLogTotals()
    expect(normalizeLandingTotals(result)).toMatchSnapshot()
  })

  it('getFlightLogTotals returns totals for single ac', async () => {
    const result = await getFlightLogTotals('OH-STL')
    expect(normalizeLandingTotals(result)).toMatchSnapshot()
  })
})

// Shared payload for the overlap cases; only the four timestamps vary between tests
const overlapTestFlight: FlightLogMemberRequest = {
  aircraftRegistration: 'OH-STL',
  picMemberId: 'Liisa1',
  crew2MemberId: null,
  crew2Role: null,
  crew3MemberId: null,
  crew3Role: null,
  crew4MemberId: null,
  crew4Role: null,
  offBlockTimeEpoch: '0',
  takeoffTimeEpoch: '0',
  landingTimeEpoch: '0',
  onBlockTimeEpoch: '0',
  oilUpliftLitres: null,
  fuelUpliftLitres: null,
  personsOnBoard: 1,
  numberOfLandings: 1,
  numberOfNightLandings: 0,
  departureAirport: 'EFHK',
  arrivalAirport: 'EFHK',
  flightType: FlightType.SCHOOL,
  billingRemarks: null,
  personalRemarks: null,
  picRole: 'PIC',
  fuelRemainingLitres: 22,
  incidentOrObservations: null,
  totalTimeInService: 1023.5,
  instrumentFlyingMins: 0,
  nightFlyingMins: 0,
  partiallyBillableFlight: false,
}

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
    expect(normalizeLandingTotals(result)).toMatchSnapshot({
      flightId: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })

    //cleanup
    const delRowcount = await deleteFlightLog(flightId, 'Matti1')
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

  it('insertFlightLog prevents adding a flight overlapping an existing NEW flight', async () => {
    // 'mikify' is a NEW OH-STL flight covering 1740816000 - 1740824100
    const overlapping: FlightLogMemberRequest = {
      ...overlapTestFlight,
      offBlockTimeEpoch: '1740819600',
      takeoffTimeEpoch: '1740819900',
      landingTimeEpoch: '1740821700',
      onBlockTimeEpoch: '1740822000',
    }

    await expect(
      insertFlightLog(overlapping, {
        memberId: 'Matti1',
        permissions: [MIKPermissions.FLIGHTLOG_USER],
      }),
    ).rejects.toThrow('Overlapping flight log entry')
  })
})

describe('deleteFlightLog', () => {
  it('unlinks a liquid record rather than failing on the FK', async () => {
    // liquid.record.flight_log_id has no ON DELETE handling: a fuelling
    // outlives the flight it was reported against, so deleting the flight
    // must unlink any record pointing at it instead of throwing a raw FK
    // violation.
    //
    // The timestamps have to satisfy three DB guards at once: minute-aligned
    // (check_all_times_in_mins), not in the future (check_epochs_not_future),
    // and after every already-validated OH-STL fixture ("Protected time
    // period" rejects an insert that on-blocks before one). "Yesterday"
    // satisfies all three relative to whenever this test actually runs,
    // without a magic constant that could drift out of range as fixtures or
    // the clock change.
    const yesterday = Math.floor(Date.now() / 1000 / 60 - 24 * 60) * 60

    let flightId: string | undefined
    let recordId: string | undefined
    try {
      flightId = await insertFlightLog(
        {
          ...overlapTestFlight,
          offBlockTimeEpoch: String(yesterday),
          takeoffTimeEpoch: String(yesterday + 300),
          landingTimeEpoch: String(yesterday + 3600),
          onBlockTimeEpoch: String(yesterday + 3900),
        },
        { memberId: 'Matti1', permissions: [MIKPermissions.FLIGHTLOG_USER] },
      )

      const provider = await db
        .selectFrom('liquid.fuelProvider')
        .select(['providerId'])
        .where('code', '=', 'LOKKI')
        .executeTakeFirstOrThrow()

      const record = await db
        .insertInto('liquid.record')
        .values({
          liquidType: 'FUEL',
          aircraftRegistration: 'OH-STL',
          memberId: 'Matti1',
          airport: 'EFNU',
          fuelType: 'JET A-1',
          providerId: provider.providerId,
          quantityLitres: 100,
          flightLogId: flightId,
          source: 'MANUAL',
          createdBy: 'Matti1',
          updatedBy: 'Matti1',
        })
        .returning('recordId')
        .executeTakeFirstOrThrow()
      recordId = record.recordId

      const deleted = await deleteFlightLog(flightId, 'Matti1')
      expect(deleted).toBe(true)
      flightId = undefined // deleteFlightLog already removed it

      const after = await db
        .selectFrom('liquid.record')
        .select(['flightLogId'])
        .where('recordId', '=', recordId)
        .executeTakeFirstOrThrow()
      expect(after.flightLogId).toBeNull()
    } finally {
      if (recordId) {
        await db.deleteFrom('liquid.recordAudit').where('recordId', '=', recordId).execute()
        await db.deleteFrom('liquid.record').where('recordId', '=', recordId).execute()
      }
      if (flightId) await db.deleteFrom('flight.logs').where('flightId', '=', flightId).execute()
    }
  })
})

describe('Db overlap query tests', () => {
  it('getOverlappingFlightLogs finds an entry covering the given interval', async () => {
    const conflicts = await getOverlappingFlightLogs({
      aircraftRegistration: 'OH-STL',
      offBlockTimeEpoch: 1740819600,
      onBlockTimeEpoch: 1740822000,
    })

    expect(conflicts.map((c) => c.flightId)).toEqual(['mikify'])
    expect(conflicts[0].status).toEqual(FlightLogStatus.NEW)
  })

  it('getOverlappingFlightLogs ignores the flight being edited', async () => {
    const conflicts = await getOverlappingFlightLogs({
      aircraftRegistration: 'OH-STL',
      offBlockTimeEpoch: 1740819600,
      onBlockTimeEpoch: 1740822000,
      excludeFlightId: 'mikify',
    })

    expect(conflicts).toEqual([])
  })

  it('getOverlappingFlightLogs treats back-to-back flights as non-overlapping', async () => {
    const conflicts = await getOverlappingFlightLogs({
      aircraftRegistration: 'OH-STL',
      offBlockTimeEpoch: 1740824100,
      onBlockTimeEpoch: 1740830000,
    })

    expect(conflicts).toEqual([])
  })

  it('getOverlappingFlightLogs does not match other aircraft', async () => {
    const conflicts = await getOverlappingFlightLogs({
      aircraftRegistration: 'OH-IHQ',
      offBlockTimeEpoch: 1740819600,
      onBlockTimeEpoch: 1740822000,
    })

    expect(conflicts).toEqual([])
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
    const expectedLandings = originalLog?.acTotalLandings
    expect(expectedLandings).toEqual(expect.any(Number))

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
    expect(result?.acTotalLandings).toEqual(expectedLandings)

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
    expect(cleaned?.acTotalLandings).toEqual(expectedLandings)
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
    expect(result.rows).toEqual(191)
    expect(result.logs.length).toEqual(41)
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
        await deleteFlightLog(id, insertUser.memberId)
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
        await deleteFlightLog(id, memberId)
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
  it('get flights statistics with single plane', async () => {
    const result = await getFlightStats('Matti1', true)
    // V203 added stl3fn1/fn2/fn3 (OH-STL) and ihq3fn1/fn2/fn3 (OH-IHQ) for Matti1.
    // Rolling-window fields use expect.any(Number) because they depend on current date.
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-STL',
        landings12month: expect.any(Number),
        landings1month: expect.any(Number),
        landings3month: expect.any(Number),
        landings6month: expect.any(Number),
        lastFlightId: 'stl3fn3',
        lastTakeoffTimeUtc: '2025-06-03T10:10:00.000Z',
        time12month: expect.any(Number),
        time1month: expect.any(Number),
        time3month: expect.any(Number),
        time6month: expect.any(Number),
        totalFlightMins: 375,
        totalFlights: 5,
        totalLandings: 5,
      },
      {
        aircraftRegistration: 'OH-IHQ',
        landings12month: expect.any(Number),
        landings1month: expect.any(Number),
        landings3month: expect.any(Number),
        landings6month: expect.any(Number),
        lastFlightId: 'ihq3fn3',
        lastTakeoffTimeUtc: '2025-05-03T10:10:00.000Z',
        time12month: expect.any(Number),
        time1month: expect.any(Number),
        time3month: expect.any(Number),
        time6month: expect.any(Number),
        // V220 added 10 VALIDATED OH-IHQ flights for Matti1 (yoy_001..yoy_010,
        // 855 min total) on top of the original ihq3fn1/fn2/fn3 (180 min).
        // All V220 flights predate 2025-05-03, so lastFlightId stays ihq3fn3.
        totalFlightMins: 1035,
        totalFlights: 13,
        totalLandings: 13,
      },
    ])
  })

  // Jukka1 is the test data's flight instructor: 17 of the flights they flew are billed
  // to the student they flew with (see V190/V210/V215 -- mikify, fi_inst2 and the dto*
  // and *nr* series). Those count towards their own landings and hours, which is what
  // #1019 Q2 asked for -- always, not behind the list's toggle.
  //
  // The rolling windows are expect.any(Number) because part of that flying is recent
  // enough to fall inside them, so the values move with the calendar.
  const rollingWindows = {
    landings12month: expect.any(Number),
    landings1month: expect.any(Number),
    landings3month: expect.any(Number),
    landings6month: expect.any(Number),
    time12month: expect.any(Number),
    time1month: expect.any(Number),
    time3month: expect.any(Number),
    time6month: expect.any(Number),
  }

  it('get flights statistics with multiple planes including inactive planes', async () => {
    const result = await getFlightStats('Jukka1', false)
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-P28',
        ...rollingWindows,
        // 3 flights billed to Jukka1 plus the 16 they instructed on this aircraft.
        lastFlightId: 'te1nr01a',
        lastTakeoffTimeUtc: '2026-04-03T21:10:00.000Z',
        totalFlightMins: 2175,
        totalFlights: 19,
        totalLandings: 40,
      },
      {
        aircraftRegistration: 'OH-IHQ',
        ...rollingWindows,
        lastFlightId: 'efnu4evr',
        lastTakeoffTimeUtc: '2025-03-02T09:20:00.000Z',
        totalFlightMins: 120,
        totalFlights: 1,
        totalLandings: 2,
      },
      {
        // Not billed to Jukka1 at all: mikify is Matti1's flight, flown with Jukka1 as FI.
        aircraftRegistration: 'OH-STL',
        ...rollingWindows,
        lastFlightId: 'mikify',
        lastTakeoffTimeUtc: '2025-03-01T08:15:00.000Z',
        totalFlightMins: 105,
        totalFlights: 1,
        totalLandings: 1,
      },
    ])
    expect(result.map((item) => item.aircraftRegistration)).toEqual(['OH-P28', 'OH-IHQ', 'OH-STL'])
  })

  it('get flights statistics excludes inactive planes but keeps instructed flights', async () => {
    const result = await getFlightStats('Jukka1', true)
    // OH-P28 is inactive, so it drops out; OH-STL stays even though every OH-STL flight
    // of Jukka1's is billed to someone else.
    expect(result).toEqual([
      {
        aircraftRegistration: 'OH-IHQ',
        ...rollingWindows,
        lastFlightId: 'efnu4evr',
        lastTakeoffTimeUtc: '2025-03-02T09:20:00.000Z',
        totalFlightMins: 120,
        totalFlights: 1,
        totalLandings: 2,
      },
      {
        aircraftRegistration: 'OH-STL',
        ...rollingWindows,
        lastFlightId: 'mikify',
        lastTakeoffTimeUtc: '2025-03-01T08:15:00.000Z',
        totalFlightMins: 105,
        totalFlights: 1,
        totalLandings: 1,
      },
    ])
  })

  it('get flights statistics counts an observer seat as not flown', async () => {
    // An OBS slot means the member was carried, so the flight is not theirs (#1019 Q6).
    // Liisa1 is STU on mikify, which is billed to Matti1 -- demoting that slot to OBS
    // must take the flight out of Liisa1's statistics entirely.
    const before = await getFlightStats('Liisa1', false)
    expect(before.flatMap((row) => row.lastFlightId)).toContain('mikify')

    await db
      .updateTable('flight.logs')
      .set({ picRole: 'OBS' })
      .where('flightId', '=', 'mikify')
      .execute()
    try {
      const after = await getFlightStats('Liisa1', false)
      expect(after.flatMap((row) => row.lastFlightId)).not.toContain('mikify')
    } finally {
      await db
        .updateTable('flight.logs')
        .set({ picRole: 'STU' })
        .where('flightId', '=', 'mikify')
        .execute()
    }
  })

  it('groups statistics by aircraft alone, not by who was billed', async () => {
    // The GROUP BY used to include billable_member_id, which was invisible while the
    // WHERE pinned it to one value. Now that a group mixes the member's own flights with
    // ones billed to their students, an aircraft must still appear exactly once.
    const result = await getFlightStats('Jukka1', false)
    const registrations = result.map((row) => row.aircraftRegistration)
    expect(registrations).toEqual([...new Set(registrations)])
  })
})

describe('Db query FlightLog on-board crew filter', () => {
  // Jukka1 instructs Liisa1 on mikify, which is billed to Matti1 (V50__FlightLogData).
  const CREW_FLIGHT = 'mikify'

  it('onBoardMemberId returns flights the member flew as crew but is not billed for', async () => {
    const result = await getFlightLogs({
      onBoardMemberId: 'Jukka1',
      aircraftRegistration: 'OH-STL',
    })

    expect(result.logs.map((log) => log.flightId)).toContain(CREW_FLIGHT)
    // ...and it really is someone else's flight
    const crewFlight = result.logs.find((log) => log.flightId === CREW_FLIGHT)
    expect(crewFlight?.billableMemberId).toEqual('Matti1')
  })

  it('billableMemberId alone does not return them — the gap #1019 closes', async () => {
    const result = await getFlightLogs({
      billableMemberId: 'Jukka1',
      aircraftRegistration: 'OH-STL',
    })
    expect(result.logs.map((log) => log.flightId)).not.toContain(CREW_FLIGHT)
  })

  it('onBoardMemberId still returns the flights billed to the member', async () => {
    const ihq = { aircraftRegistration: 'OH-IHQ', limit: 200 }
    const billed = await getFlightLogs({ ...ihq, billableMemberId: 'Matti1' })
    const onBoard = await getFlightLogs({ ...ihq, onBoardMemberId: 'Matti1' })
    const onBoardIds = onBoard.logs.map((row) => row.flightId)

    expect(billed.logs.length).toBeGreaterThan(0)
    // Widening the filter may only ever add rows: turning the toggle on must not hide a
    // flight the member is being invoiced for.
    for (const log of billed.logs) {
      expect(onBoardIds).toContain(log.flightId)
    }
  })

  it.each([
    ['PIC', true],
    ['FI', true],
    ['FE', true],
    ['STU', true],
    ['OBS', false],
  ])('a %s crew slot counts as on board: %s', async (role, expected) => {
    // Liisa1 sits in slot 1 of mikify, which is billed to Matti1, so the only reason the
    // flight can appear in Liisa1's log is the crew slot — exactly what the role filter
    // decides (#1019 Q6).
    await db
      .updateTable('flight.logs')
      .set({ picRole: role as 'PIC' })
      .where('flightId', '=', CREW_FLIGHT)
      .execute()
    try {
      const result = await getFlightLogs({ onBoardMemberId: 'Liisa1', flightId: CREW_FLIGHT })
      expect(result.rows === 1).toEqual(expected)
    } finally {
      await db
        .updateTable('flight.logs')
        .set({ picRole: 'STU' })
        .where('flightId', '=', CREW_FLIGHT)
        .execute()
    }
  })

  it('derives myCrewRole and isOwnFlight from the viewer, without leaking crew ids', async () => {
    const asInstructor = await getFlightLogs({ flightId: CREW_FLIGHT }, 'Jukka1')
    expect(asInstructor.logs[0].myCrewRole).toEqual('FI')
    expect(asInstructor.logs[0].isOwnFlight).toEqual(false)

    const asBilledMember = await getFlightLogs({ flightId: CREW_FLIGHT }, 'Matti1')
    // Matti1 pays for this flight but is in no crew slot on it
    expect(asBilledMember.logs[0].myCrewRole).toBeNull()
    expect(asBilledMember.logs[0].isOwnFlight).toEqual(true)

    const asStranger = await getFlightLogs({ flightId: CREW_FLIGHT }, 'Sanna1')
    expect(asStranger.logs[0].myCrewRole).toBeNull()
    expect(asStranger.logs[0].isOwnFlight).toEqual(false)

    // The crew slots are selected to derive the two fields above and must not survive
    // into the row: they are other members' ids.
    expect(asStranger.logs[0]).not.toHaveProperty('picMemberId')
    expect(asStranger.logs[0]).not.toHaveProperty('crew2MemberId')
  })

  it('reports no crew role for a viewer who was only carried as an observer', async () => {
    // Also covers the row an OBS viewer reaches without the on-board filter — an aircraft
    // logbook page. Marking it with a role would make the list offer a link the detail
    // endpoint then refuses.
    await db
      .updateTable('flight.logs')
      .set({ crew2Role: 'OBS' })
      .where('flightId', '=', CREW_FLIGHT)
      .execute()
    try {
      const result = await getFlightLogs({ flightId: CREW_FLIGHT }, 'Jukka1')
      expect(result.logs[0].myCrewRole).toBeNull()
      expect(result.logs[0].isOwnFlight).toEqual(false)
    } finally {
      await db
        .updateTable('flight.logs')
        .set({ crew2Role: 'FI' })
        .where('flightId', '=', CREW_FLIGHT)
        .execute()
    }
  })

  it('leaves both derived fields inert when no viewer is given', async () => {
    const result = await getFlightLogs({ flightId: CREW_FLIGHT })
    expect(result.logs[0].myCrewRole).toBeNull()
    expect(result.logs[0].isOwnFlight).toEqual(false)
  })

  it('viewerMemberId does not filter anything', async () => {
    const withViewer = await getFlightLogs({ aircraftRegistration: 'OH-STL' }, 'Sanna1')
    const withoutViewer = await getFlightLogs({ aircraftRegistration: 'OH-STL' })
    expect(withViewer.rows).toEqual(withoutViewer.rows)
  })

  it('anyCrewMemberId keeps its role-agnostic meaning for the members admin view', async () => {
    // The members-admin "recent flights" widget answers "was this member involved at
    // all", so an observer seat still counts there.
    await db
      .updateTable('flight.logs')
      .set({ picRole: 'OBS' })
      .where('flightId', '=', CREW_FLIGHT)
      .execute()
    try {
      const anyCrew = await getFlightLogs({ anyCrewMemberId: 'Liisa1', flightId: CREW_FLIGHT })
      const onBoard = await getFlightLogs({ onBoardMemberId: 'Liisa1', flightId: CREW_FLIGHT })
      expect(anyCrew.rows).toEqual(1)
      expect(onBoard.rows).toEqual(0)
    } finally {
      await db
        .updateTable('flight.logs')
        .set({ picRole: 'STU' })
        .where('flightId', '=', CREW_FLIGHT)
        .execute()
    }
  })
})

describe('Db FlightLog audit trail', () => {
  // The trail is written by the V160 trigger on every write, so exercising it means
  // actually updating a flight and putting it back.
  const auditUser = {
    memberId: 'Liisa1',
    lastName: 'Test',
    email: '',
    roles: [],
    permissions: [MIKPermissions.FLIGHTLOG_USER],
    canMakeReservations: false,
  }
  const FLIGHT = 'bLwnAstr0'

  /** Applies a patch, reads the newest trail entry, then puts the flight back. */
  const auditFor = async (patch: Partial<FlightLog>, hiddenFields?: string[]) => {
    const before = await getFlightLog(FLIGHT)
    const restore = Object.fromEntries(
      Object.keys(patch).map((key) => [key, before![key as keyof FlightLog]]),
    ) as Partial<FlightLog>
    await updateFlightLog(FLIGHT, patch, { ...auditUser })
    try {
      const entries = await getFlightLogAuditTrail(FLIGHT, hiddenFields)
      return { before: before!, entries }
    } finally {
      await updateFlightLog(FLIGHT, restore, { ...auditUser, memberId: before!.updatedBy })
    }
  }

  it('reports the fields an update changed, newest first', async () => {
    const { before, entries } = await auditFor({ numberOfLandings: 7 })

    expect(entries[0].operationType).toEqual('UPDATE')
    expect(entries[0].changedBy).toEqual('Liisa1')
    expect(entries[0].changedAt).toEqual(expect.any(String))
    expect(entries[0].changes).toEqual([
      { field: 'numberOfLandings', before: String(before.numberOfLandings), after: '7' },
    ])
  })

  it('leaves out the audit columns and the values derived from the flight times', async () => {
    const { entries } = await auditFor({ totalTimeInService: 12 })
    const fields = entries[0].changes.map((change) => change.field)

    expect(fields).toContain('totalTimeInService')
    // updatedAt/updatedBy change on every update and are the trail's own columns
    expect(fields).not.toContain('updatedAt')
    expect(fields).not.toContain('updatedBy')
    // block/flight durations are generated from the epochs, not edited
    expect(fields).not.toContain('blockMins')
    expect(fields).not.toContain('flightTime')
  })

  it('reports the crew slot a change moved, using contract field names', async () => {
    const { entries } = await auditFor({ crew3MemberId: 'Sanna1', crew3Role: 'OBS' })
    const fields = entries[0].changes.map((change) => change.field)

    // camelCase, not the crew3_member_id spelling the JSONB snapshot actually holds
    expect(fields).toContain('crew3MemberId')
    expect(fields).toContain('crew3Role')
    // the denormalised last-name copy moves with the id and is not reported separately
    expect(fields).not.toContain('crew3LastName')
  })

  it('hides the fields the caller may not see', async () => {
    const visible = await auditFor({ billingRemarks: 'audit trail test' })
    expect(visible.entries[0].changes.map((change) => change.field)).toContain('billingRemarks')

    const hidden = await auditFor({ billingRemarks: 'audit trail test' }, ['billingRemarks'])
    expect(hidden.entries[0].changes.map((change) => change.field)).not.toContain('billingRemarks')
  })

  it('returns no entries for an unknown flight', async () => {
    expect(await getFlightLogAuditTrail('nosuchid')).toEqual([])
  })
})

describe('Db FlightLog export tests', () => {
  // Instructor flights on OH-P28 (see V190__InstructorFlightData.sql):
  //   fi_inst1: Matti1 (STU, slot 1) + Jukka1 (FI, crew2), billed to Jukka1
  //   fi_inst2: Anna1  (STU, slot 1) + Jukka1 (FI, crew2)
  //   fi_inst3: Jukka1 (FI,  slot 1) + Liisa1 (STU, crew2)
  const instructorFlights = {
    aircraftRegistration: 'OH-P28',
    startDate: '2025-04-01T00:00:00.000Z',
    endDate: '2025-05-31T00:00:00.000Z',
  }

  // The "mass" test flights are all flown by Pekka1 as PIC but billed to other members.
  const massFlights = {
    startDate: '2010-01-01T00:00:00.000Z',
    endDate: '2010-06-30T00:00:00.000Z',
  }

  it('counts the flights the member actually flew, not the ones they were billed for', async () => {
    // Kaisa1 is billed for 43 of the mass flights but flew none of them
    expect(await countFlightLogsForExport(massFlights, 'Kaisa1')).toEqual(0)
    expect(await countFlightLogsForExport(massFlights, 'Pekka1')).toEqual(200)
    expect(await countFlightLogsForExport(massFlights)).toEqual(200)
  })

  it('reports the instructor own FI role regardless of the crew slot they occupied', async () => {
    const logs = await getFlightLogsForExport(instructorFlights, 'Jukka1')

    expect(logs.map((l) => l.flightId)).toEqual(['fi_inst1', 'fi_inst2', 'fi_inst3'])
    expect(logs.map((l) => l.ownRole)).toEqual(['FI', 'FI', 'FI'])
    // Jukka1 is the instructor and therefore the pilot in command on all three
    expect(logs.map((l) => l.actingPicLastName)).toEqual(['Nieminen', 'Nieminen', 'Nieminen'])
    // slot 1 holds the student on the first two flights
    expect(logs.map((l) => l.picRole)).toEqual(['STU', 'STU', 'FI'])
  })

  it('reports the student own STU role and the instructor as pilot in command', async () => {
    const logs = await getFlightLogsForExport(instructorFlights, 'Matti1')
    const dualFlight = logs.find((l) => l.flightId === 'fi_inst1')

    expect(dualFlight?.ownRole).toEqual('STU')
    expect(dualFlight?.actingPicLastName).toEqual('Nieminen')
    // Matti1 also flew solo flights on the same aircraft in this period
    expect(logs.filter((l) => l.ownRole === 'PIC').length).toBeGreaterThan(0)
  })

  it('falls back to crew slot 1 for exports that are not scoped to a member', async () => {
    const logs = await getFlightLogsForExport(instructorFlights)
    const dualFlight = logs.find((l) => l.flightId === 'fi_inst1')

    expect(dualFlight?.ownRole).toEqual('STU')
    expect(dualFlight?.picRole).toEqual('STU')
    expect(dualFlight?.actingPicLastName).toEqual('Nieminen')
  })

  it('treats flight examiners as acting PIC when no PIC or FI role is present', async () => {
    const logs = await getFlightLogsForExport(
      {
        aircraftRegistration: 'OH-STL',
        startDate: '2024-03-11T00:00:00.000Z',
        endDate: '2024-03-13T00:00:00.000Z',
      },
      'Sanna1',
    )
    const examinerFlight = logs.find((l) => l.flightId === 'eject')

    expect(examinerFlight?.ownRole).toEqual('STU')
    expect(examinerFlight?.picRole).toEqual('STU')
    expect(examinerFlight?.actingPicLastName).toEqual('Seppälä')
  })
})
