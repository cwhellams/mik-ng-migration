import 'dotenv/config'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'

import { db } from '../../src/db/connection.ts'
import {
  deleteAircraftLandingsBaseline,
  getAircraftLandingsBaseline,
  setAircraftLandingsBaseline,
} from '../../src/db/ajlb-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

/**
 * These three functions were the last code in the backend talking to `connection.pool`
 * directly, and nothing covered them — the ajlb tests only exercise the CRUD helpers.
 * That mattered for the camelCase migration (issue #1115, phase 5), because moving them
 * off `pool.connect()` means replacing hand-rolled BEGIN/COMMIT/ROLLBACK with
 * `db.transaction()`, and the backfill they run is three statements of recursive
 * CTE and window-function SQL whose behaviour no test pinned.
 *
 * The fixture is a private aircraft with three logbooks, so the recursive CTE in step 2
 * has a real chain to walk (it is the part that a 2-logbook fixture would not exercise:
 * book 3's start depends on book 2's *computed* start, not on the baseline).
 */
describe('aircraft landings baseline', () => {
  const REG = 'OH-TST'
  const jwt: JWTUser = {
    memberId: 'Matti1',
    lastName: 'Test',
    email: 'baseline-test',
    roles: [],
    permissions: [],
    canMakeReservations: false,
  }

  // 2 landings in book 1, 3 in book 2, and one NEW flight that must be ignored.
  const flights = [
    // check_all_times_in_mins requires every epoch to land on a whole minute.
    { id: 'BLT00001', seq: 1, epoch: 1768200000, landings: 1, status: 'VALIDATED' },
    { id: 'BLT00002', seq: 1, epoch: 1768286400, landings: 1, status: 'VALIDATED' },
    { id: 'BLT00003', seq: 2, epoch: 1768372800, landings: 2, status: 'VALIDATED' },
    { id: 'BLT00004', seq: 2, epoch: 1768459200, landings: 1, status: 'VALIDATED' },
    { id: 'BLT00005', seq: 3, epoch: 1768545600, landings: 7, status: 'NEW' },
  ] as const

  beforeAll(async () => {
    await db
      .insertInto('flight.aircraft')
      .values({
        registration: REG,
        displayName: 'Baseline Test',
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

    for (const seqNo of [1, 2, 3]) {
      await db
        .insertInto('flight.aircraftJourneyLogBook')
        .values({
          aircraftRegistration: REG,
          seqNo,
          noOfPages: 10,
          rowsPerPage: 30,
          startPage: 1,
          startFlightMins: 0,
          startLandings: 0,
          startDate: `2025-0${seqNo}-01`,
          // ux_one_open_ajlb_per_aircraft allows a single open logbook, so only the
          // last one in the chain may be left without an end date.
          endDate: seqNo === 3 ? null : `2025-0${seqNo}-28`,
          createdBy: jwt.memberId!,
          updatedBy: jwt.memberId!,
        })
        .execute()
    }

    for (const f of flights) {
      await db
        .insertInto('flight.logs')
        .values({
          flightId: f.id,
          aircraftRegistration: REG,
          ajlbSeqNo: f.seq,
          ajlbBlankRowsBefore: 0,
          billableMemberId: jwt.memberId!,
          picMemberId: jwt.memberId!,
          picLastName: 'Test',
          picRole: 'PIC',
          personsOnBoard: 1,
          offBlockTimeEpoch: f.epoch,
          takeoffTimeEpoch: f.epoch + 60,
          landingTimeEpoch: f.epoch + 3600,
          onBlockTimeEpoch: f.epoch + 3660,
          nightFlyingMins: 0,
          instrumentFlyingMins: 0,
          numberOfLandings: f.landings,
          departureAirport: 'EFHK',
          arrivalAirport: 'EFHK',
          fuelRemainingLitres: 20,
          isBillableFlight: false,
          isDtoTrainingFlight: false,
          flightType: 'PRIVATE',
          privOrComFlight: 'C',
          status: f.status,
          // check_verified_values: a non-NEW flight must carry its logbook placement.
          ajlbTotalFlightMins: f.status === 'NEW' ? null : 60,
          ajlbPageNumber: f.status === 'NEW' ? null : 1,
          ajlbRowNumber: f.status === 'NEW' ? null : 1,
          createdBy: jwt.memberId!,
          updatedBy: jwt.memberId!,
        })
        .execute()
    }
  })

  afterAll(async () => {
    await db.deleteFrom('flight.logs').where('aircraftRegistration', '=', REG).execute()
    await db
      .deleteFrom('flight.aircraftLandingsBaseline')
      .where('aircraftRegistration', '=', REG)
      .execute()
    await db
      .deleteFrom('flight.aircraftJourneyLogBook')
      .where('aircraftRegistration', '=', REG)
      .execute()
    await db.deleteFrom('flight.aircraft').where('registration', '=', REG).execute()
  })

  beforeEach(async () => {
    await deleteAircraftLandingsBaseline(REG)
  })

  const startLandings = async () =>
    (
      await db
        .selectFrom('flight.aircraftJourneyLogBook')
        .select(['seqNo', 'startLandings'])
        .where('aircraftRegistration', '=', REG)
        .orderBy('seqNo')
        .execute()
    ).map((r) => r.startLandings)

  const totalLandings = async () =>
    (
      await db
        .selectFrom('flight.logs')
        .select(['flightId', 'ajlbTotalLandings'])
        .where('aircraftRegistration', '=', REG)
        .orderBy('flightId')
        .execute()
    ).map((r) => r.ajlbTotalLandings)

  it('returns undefined when no baseline is set', async () => {
    expect(await getAircraftLandingsBaseline(REG)).toBeUndefined()
  })

  it('stores a baseline and reads it back', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    expect(await getAircraftLandingsBaseline(REG)).toMatchObject({
      aircraftRegistration: REG,
      baselineLandings: 1000,
      createdBy: jwt.memberId,
      updatedBy: jwt.memberId,
    })
  })

  it('reports a deleted author as null rather than an empty member id', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    // What `ON DELETE SET NULL` on the member FK does when the member who set the
    // baseline is removed. Done directly here so the test does not have to delete a
    // member the rest of the fixture is still using.
    await db
      .updateTable('flight.aircraftLandingsBaseline')
      .set({ createdBy: null, updatedBy: null })
      .where('aircraftRegistration', '=', REG)
      .execute()

    expect(await getAircraftLandingsBaseline(REG)).toMatchObject({
      createdBy: null,
      updatedBy: null,
    })
  })

  it('upserts rather than failing when a baseline already exists', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)
    await setAircraftLandingsBaseline(REG, 2000, jwt)

    expect(await getAircraftLandingsBaseline(REG)).toMatchObject({ baselineLandings: 2000 })
    expect(await startLandings()).toEqual([2000, 2002, 2005])
  })

  it('accumulates start_landings across the whole logbook chain', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    // book 1 = baseline; book 2 = 1000 + 2 landings in book 1; book 3 = 1002 + 3 in
    // book 2. Book 3's value is what the recursive step produces — it cannot be derived
    // from the baseline alone.
    expect(await startLandings()).toEqual([1000, 1002, 1005])
  })

  it('sets a running landings total per flight, ignoring NEW flights', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    // 1001, 1002 in book 1; 1004, 1005 in book 2; the NEW flight stays null.
    expect(await totalLandings()).toEqual([1001, 1002, 1004, 1005, null])
  })

  it('clears the baseline and everything derived from it', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    expect(await deleteAircraftLandingsBaseline(REG)).toBe(true)
    expect(await getAircraftLandingsBaseline(REG)).toBeUndefined()
    expect(await startLandings()).toEqual([0, 0, 0])
    expect(await totalLandings()).toEqual([null, null, null, null, null])
  })

  it('reports false and touches nothing when there is no baseline to delete', async () => {
    expect(await deleteAircraftLandingsBaseline(REG)).toBe(false)
  })

  it('rolls the whole write back when the backfill fails', async () => {
    await setAircraftLandingsBaseline(REG, 1000, jwt)

    // The backfill adds each book's landings to the running start, so a baseline at the
    // top of `integer` overflows on the first addition. That happens in the statement
    // *after* the upsert, which is what makes this a rollback test rather than a
    // validation test: the hand-rolled BEGIN/ROLLBACK this replaced had to get the
    // error path right by hand.
    await expect(setAircraftLandingsBaseline(REG, 2_147_483_647, jwt)).rejects.toThrow(
      /out of range/,
    )

    expect(await getAircraftLandingsBaseline(REG)).toMatchObject({ baselineLandings: 1000 })
    expect(await startLandings()).toEqual([1000, 1002, 1005])
  })
})
