import 'dotenv/config'

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import {
  getAjlbPageItemRows,
  getFlightLogs,
  isAjlbItemFrozen,
  updateFlightLogStatus,
} from '../../src/db/flight-log-queries.ts'
import { createMaintenanceNote } from '../../src/db/maintenance-note-queries.ts'
import { FlightLogStatus } from '@mik/contracts/flight-log'
import type { JWTUser } from '../../src/routes/auth/token.ts'

/**
 * Issue #1267: a maintenance note recorded AFTER a flight disappeared from the flight log
 * the moment the NEXT flight was validated, and came back if that flight was un-validated.
 * Flights get their logbook position frozen onto the row when validated; notes and defects
 * did not, yet the live view dropped them as soon as the validated baseline passed them --
 * so they were materialised nowhere and became unreachable by any query.
 *
 * These tests validate and revert real flights, which mutates the ajlb they belong to, so
 * they run against their own aircraft rather than a shared fixture: OH-FRZ, one logbook,
 * rows_per_page 5 (small enough that a page boundary is cheap to reach), start_flight_mins
 * 1000, three 60-minute NEW flights -- running totals 1060, 1120, 1180.
 */
describe('ajlb note/defect position freeze', () => {
  const REG = 'OH-FRZ'
  const SEQ_NO = 1
  const START_PAGE = 100
  const jwt: JWTUser = {
    memberId: 'Matti1',
    lastName: 'Test',
    email: 'freeze-test',
    roles: [],
    permissions: [],
    canMakeReservations: false,
  }

  // 1768800000 is a whole minute (check_all_times_in_mins), and each flight is 60 mins
  // of flight time exactly, so the running totals are easy to read.
  const flights = [
    { id: 'FRZ00001', epoch: 1768800000, total: 1060 },
    { id: 'FRZ00002', epoch: 1768886400, total: 1120 },
    { id: 'FRZ00003', epoch: 1768972800, total: 1180 },
  ] as const

  beforeAll(async () => {
    await db
      .insertInto('flight.aircraft')
      .values({
        registration: REG,
        displayName: 'Freeze Test',
        model: 'C172',
        manufacturer: 'Cessna',
        yearOfManufacture: 1999,
        seats: 4,
        usableFuelLitres: 120,
        fuelTypes: ['MOGAS'],
        maintenanceCycle: 50,
        lastMaintenanceDate: '2025-01-01',
        lastMaintenanceType: '50h',
        lastMaintenanceMins: 0,
        nextMaintenanceType: '100h',
        nextMaintenanceMins: 3000,
        totalPercentageHours: 100,
        reservedHours: 0,
        createdBy: jwt.memberId!,
        updatedBy: jwt.memberId!,
      })
      .execute()

    await db
      .insertInto('flight.aircraftJourneyLogBook')
      .values({
        aircraftRegistration: REG,
        seqNo: SEQ_NO,
        noOfPages: 20,
        rowsPerPage: 5,
        startPage: START_PAGE,
        startFlightMins: 1000,
        startLandings: 0,
        startDate: '2026-01-01',
        endDate: null,
        createdBy: jwt.memberId!,
        updatedBy: jwt.memberId!,
      })
      .execute()

    for (const flight of flights) {
      await db
        .insertInto('flight.logs')
        .values({
          flightId: flight.id,
          aircraftRegistration: REG,
          ajlbSeqNo: SEQ_NO,
          ajlbBlankRowsBefore: 0,
          billableMemberId: jwt.memberId!,
          picMemberId: jwt.memberId!,
          picLastName: 'Test',
          picRole: 'PIC',
          personsOnBoard: 1,
          offBlockTimeEpoch: flight.epoch,
          takeoffTimeEpoch: flight.epoch + 60,
          landingTimeEpoch: flight.epoch + 3660,
          onBlockTimeEpoch: flight.epoch + 3720,
          nightFlyingMins: 0,
          instrumentFlyingMins: 0,
          numberOfLandings: 1,
          departureAirport: 'EFHK',
          arrivalAirport: 'EFHK',
          fuelRemainingLitres: 20,
          isBillableFlight: false,
          isDtoTrainingFlight: false,
          flightType: 'PRIVATE',
          privOrComFlight: 'C',
          status: FlightLogStatus.NEW,
          createdBy: jwt.memberId!,
          updatedBy: jwt.memberId!,
        })
        .execute()
    }
  })

  afterAll(async () => {
    await db.deleteFrom('flight.maintenanceNote').where('aircraftRegistration', '=', REG).execute()
    await db.deleteFrom('flight.defect').where('aircraftRegistration', '=', REG).execute()
    await db.deleteFrom('flight.logs').where('aircraftRegistration', '=', REG).execute()
    await db
      .deleteFrom('flight.aircraftJourneyLogBook')
      .where('aircraftRegistration', '=', REG)
      .execute()
    await db.deleteFrom('flight.aircraft').where('registration', '=', REG).execute()
  })

  // Every test starts from "three NEW flights, no notes", whatever it validated.
  afterEach(async () => {
    await db.deleteFrom('flight.maintenanceNote').where('aircraftRegistration', '=', REG).execute()
    await db.deleteFrom('flight.defect').where('aircraftRegistration', '=', REG).execute()
    await db
      .updateTable('flight.logs')
      .set({
        status: FlightLogStatus.NEW,
        ajlbTotalFlightMins: null,
        ajlbPageNumber: null,
        ajlbRowNumber: null,
        ajlbTotalLandings: null,
      })
      .where('aircraftRegistration', '=', REG)
      .execute()
  })

  const validate = (flightId: string) =>
    updateFlightLogStatus(flightId, FlightLogStatus.NEW, FlightLogStatus.VALIDATED, {}, jwt)

  const revert = (flightId: string) =>
    updateFlightLogStatus(flightId, FlightLogStatus.VALIDATED, FlightLogStatus.NEW, {}, jwt)

  /** Where each own-row note/defect physically sits, across every page of the logbook. */
  const itemRows = async () => {
    const rows = await db
      .selectFrom('flight.vwAjlbLiveRows')
      .select(['itemId', 'pageNumber', 'rowNumber', 'isContentRow'])
      .where('aircraftRegistration', '=', REG)
      .where('ajlbSeqNo', '=', SEQ_NO)
      .orderBy('pageNumber')
      .orderBy('rowNumber')
      .execute()
    return rows.map((row) => ({
      itemId: row.itemId,
      page: row.pageNumber,
      row: row.rowNumber,
      content: row.isContentRow,
    }))
  }

  const flightRows = async () => {
    const rows = await db
      .selectFrom('flight.logs')
      .leftJoin('flight.vwFlightLogs as live', 'flight.logs.flightId', 'live.flightId')
      .select([
        'flight.logs.flightId',
        'flight.logs.ajlbPageNumber',
        'flight.logs.ajlbRowNumber',
        'live.pageNumber',
        'live.rowNumber',
      ])
      .where('aircraftRegistration', '=', REG)
      .orderBy('flight.logs.offBlockTimeEpoch')
      .execute()
    return rows.map((row) => ({
      flightId: row.flightId,
      page: row.ajlbPageNumber ?? row.pageNumber,
      row: row.ajlbRowNumber ?? row.rowNumber,
    }))
  }

  const noteAfter = (total: number, rows = 1) =>
    createMaintenanceNote(
      {
        aircraftRegistration: REG,
        ajlbSeqNo: SEQ_NO,
        description: `Note at ${total}`,
        performedBy: 'Mechanic',
        flightMins: total,
        rows,
      },
      jwt.memberId!,
    )

  it('keeps a note recorded after a flight visible once the next flight is validated', async () => {
    // The reported reproduction: the note's time is exactly the first flight's running
    // total, i.e. it was written into the logbook straight after that flight landed.
    const note = await noteAfter(1060)

    expect(await itemRows()).toEqual([{ itemId: note.noteId, page: 100, row: 2, content: true }])

    await validate('FRZ00001')
    // Still fine before the fix too: the note's time equals the new baseline, so the old
    // flight_mins >= baseline_mins filter still let it through.
    expect(await itemRows()).toEqual([{ itemId: note.noteId, page: 100, row: 2, content: true }])

    await validate('FRZ00002')
    // This is where the note used to vanish -- baseline_mins moved to 1120, past the
    // note's 1060, and nothing else held its position.
    expect(await itemRows()).toEqual([{ itemId: note.noteId, page: 100, row: 2, content: true }])
  })

  it('freezes the position onto the note row, so it no longer depends on the live view', async () => {
    const note = await noteAfter(1060)
    expect(await isAjlbItemFrozen('note', note.noteId)).toBe(false)

    await validate('FRZ00001')

    expect(await isAjlbItemFrozen('note', note.noteId)).toBe(true)
    await expect(
      db
        .selectFrom('flight.maintenanceNote')
        .select(['ajlbPageNumber', 'ajlbRowNumber'])
        .where('noteId', '=', note.noteId)
        .executeTakeFirst(),
    ).resolves.toEqual({ ajlbPageNumber: 100, ajlbRowNumber: 2 })
  })

  it('numbers the flights after a frozen note instead of on top of it', async () => {
    await noteAfter(1060)

    // Before: flight 1 row 1, note row 2, flights 2 and 3 rows 3 and 4.
    expect(await flightRows()).toEqual([
      { flightId: 'FRZ00001', page: 100, row: 1 },
      { flightId: 'FRZ00002', page: 100, row: 3 },
      { flightId: 'FRZ00003', page: 100, row: 4 },
    ])

    await validate('FRZ00001')
    await validate('FRZ00002')

    // The frozen note keeps row 2, so flight 2 freezes onto row 3 and flight 3 still
    // computes row 4 -- every flight lands on the row it occupied while live.
    expect(await flightRows()).toEqual([
      { flightId: 'FRZ00001', page: 100, row: 1 },
      { flightId: 'FRZ00002', page: 100, row: 3 },
      { flightId: 'FRZ00003', page: 100, row: 4 },
    ])
  })

  it('freezes a note anchored to the validated flight, on the row after it', async () => {
    // 1100 falls inside flight 2 (1060 -> 1120), so it anchors there and sits below it.
    const note = await noteAfter(1100)

    await validate('FRZ00001')
    expect(await isAjlbItemFrozen('note', note.noteId)).toBe(false)

    await validate('FRZ00002')
    expect(await isAjlbItemFrozen('note', note.noteId)).toBe(true)
    expect(await itemRows()).toEqual([{ itemId: note.noteId, page: 100, row: 3, content: true }])
    expect(await flightRows()).toEqual([
      { flightId: 'FRZ00001', page: 100, row: 1 },
      { flightId: 'FRZ00002', page: 100, row: 2 },
      { flightId: 'FRZ00003', page: 100, row: 4 },
    ])
  })

  it('releases items frozen after the reverted flight and restores the live layout', async () => {
    const before = await noteAfter(1060)
    const anchored = await noteAfter(1100)
    const liveLayout = await itemRows()

    await validate('FRZ00001')
    await validate('FRZ00002')
    expect(await isAjlbItemFrozen('note', before.noteId)).toBe(true)
    expect(await isAjlbItemFrozen('note', anchored.noteId)).toBe(true)

    await revert('FRZ00002')
    // Only what sat after flight 2 is released: the note above it stays frozen, which is
    // what keeps the baseline where it is and brings flight 2 back onto its own old row.
    expect(await isAjlbItemFrozen('note', before.noteId)).toBe(true)
    expect(await isAjlbItemFrozen('note', anchored.noteId)).toBe(false)
    expect(await itemRows()).toEqual(liveLayout)

    await revert('FRZ00001')
    expect(await isAjlbItemFrozen('note', before.noteId)).toBe(false)
    expect(await itemRows()).toEqual(liveLayout)
    expect(await flightRows()).toEqual([
      { flightId: 'FRZ00001', page: 100, row: 1 },
      { flightId: 'FRZ00002', page: 100, row: 3 },
      { flightId: 'FRZ00003', page: 100, row: 5 },
    ])
  })

  it('carries a frozen multi-row note onto the next page, like a live one', async () => {
    // 1150 falls inside flight 3 (1120 -> 1180), so the note anchors below it on row 4 and
    // its 3 rows run off the end of the 5-row page onto the next spread. Validating flight
    // 3 then leaves it behind the baseline: pre-fix, all three rows vanished at once.
    const note = await noteAfter(1150, 3)
    await validate('FRZ00001')
    await validate('FRZ00002')
    await validate('FRZ00003')

    expect(await isAjlbItemFrozen('note', note.noteId)).toBe(true)
    expect(await itemRows()).toEqual([
      { itemId: note.noteId, page: 100, row: 4, content: true },
      { itemId: note.noteId, page: 100, row: 5, content: false },
      { itemId: note.noteId, page: 102, row: 1, content: false },
    ])

    // ...and the pages the logbook actually renders from agree.
    expect(await getAjlbPageItemRows(REG, SEQ_NO, 100)).toEqual([
      { itemType: 'note', itemId: note.noteId, rowNumber: 4, isContentRow: true },
      { itemType: 'note', itemId: note.noteId, rowNumber: 5, isContentRow: false },
    ])
    expect(await getAjlbPageItemRows(REG, SEQ_NO, 102)).toEqual([
      { itemType: 'note', itemId: note.noteId, rowNumber: 1, isContentRow: false },
    ])
  })

  it('shows an unfrozen note behind the baseline at the head of the live region', async () => {
    await validate('FRZ00001')

    // Written straight into the table: the create/patch routes reject a time behind the
    // baseline, so this is the shape production data got into before the fix -- a note
    // with no frozen position that the live view used to filter out entirely.
    const stranded = await createMaintenanceNote(
      {
        aircraftRegistration: REG,
        ajlbSeqNo: SEQ_NO,
        description: 'Stranded behind the baseline',
        performedBy: 'Mechanic',
        flightMins: 1010,
        rows: 1,
      },
      jwt.memberId!,
    )

    expect(await isAjlbItemFrozen('note', stranded.noteId)).toBe(false)
    expect(await itemRows()).toEqual([
      { itemId: stranded.noteId, page: 100, row: 2, content: true },
    ])
  })

  it('reports the logbook page a frozen note sits on to getFlightLogs', async () => {
    const note = await noteAfter(1060)
    await validate('FRZ00001')
    await validate('FRZ00002')

    const page = await getFlightLogs({
      aircraftRegistration: REG,
      ajlbSeqNo: SEQ_NO,
      page: START_PAGE,
    })

    expect(page.pageItemRows).toEqual([
      { itemType: 'note', itemId: note.noteId, rowNumber: 2, isContentRow: true },
    ])
  })
})
