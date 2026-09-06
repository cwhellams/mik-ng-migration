import { auditCreate, auditUpdate } from './audit.ts'
import * as connection from './connection.ts'
import type {
  AjlbFilter,
  AircraftJourneyLogBook,
  AircraftLandingsBaseline,
} from '@mik/contracts/ajlb'
import type { FlightAircraftJourneyLogBook, FlightVwFlightTimeTotals } from '@mik/db-schema/schema'
import { sql, type Selectable, type Transaction } from 'kysely'
import type { DB } from '@mik/db-schema/schema'
import type { Upsert } from '@mik/contracts/schema'
import type { JWTUser } from '../routes/auth/token.ts'

const mapResultToAjlb = (
  row: Selectable<
    FlightAircraftJourneyLogBook &
      Pick<
        FlightVwFlightTimeTotals,
        | 'lastPage'
        | 'newFlightsPage'
        | 'sumNewTime'
        | 'sumNewFlights'
        | 'sumValidatedTime'
        | 'sumValidatedFlights'
        | 'validatedOnBlockTimeUtc'
        | 'verifiedTotalFlightTime'
        | 'unverifiedTotalFlightTime'
        | 'unverifiedTotalFlightMins'
        | 'validatedTotalLandings'
        | 'totalLandings'
      >
  >,
): AircraftJourneyLogBook => ({
  seqNo: row.seqNo,
  aircraftRegistration: row.aircraftRegistration,
  startFlightMins: row.startFlightMins,
  startFlightTime: row.startFlightTime,
  startLandings: row.startLandings,
  noOfPages: row.noOfPages,
  rowsPerPage: row.rowsPerPage,
  startPage: row.startPage,
  startDate: row.startDate,
  endDate: row.endDate ? row.endDate : null,
  view: {
    lastPage: row.lastPage ?? 0,
    newFlightsPage: row.newFlightsPage,
    newFlightsCount: row.sumNewFlights ?? 0,
    newFlightsTime: row.sumNewTime ?? '00:00',
    validatedBeforeUTC: row.validatedOnBlockTimeUtc?.toISOString() ?? null,
    verifiedTotalFlightTime: row.verifiedTotalFlightTime ?? '00:00',
    unverifiedTotalFlightTime: row.unverifiedTotalFlightTime ?? '00:00',
    unverifiedTotalFlightMins: row.unverifiedTotalFlightMins ?? 0,
    validatedFlightsCount: row.sumValidatedFlights ?? 0,
    validatedFlightsTime: row.sumValidatedTime ?? '00:00',
    validatedTotalLandings: row.validatedTotalLandings ?? 0,
    totalLandings: row.totalLandings ?? 0,
  },

  updatedAt: row.updatedAt?.toISOString(),
  updatedBy: row.updatedBy,
  createdAt: row.createdAt?.toISOString(),
  createdBy: row.createdBy,
})

export async function getAjlbs(filter: AjlbFilter): Promise<AircraftJourneyLogBook[]> {
  let query = connection.db
    .selectFrom('flight.aircraftJourneyLogBook as ajlb')
    .leftJoin('flight.vwFlightTimeTotals as totals', (join) =>
      join
        .onRef('ajlb.aircraftRegistration', '=', 'totals.aircraftRegistration')
        .onRef('ajlb.seqNo', '=', 'totals.ajlbSeqNo'),
    )
    .selectAll('ajlb')
    .select([
      'totals.lastPage',
      'totals.newFlightsPage',
      'totals.sumNewTime',
      'totals.sumNewFlights',
      'totals.sumValidatedTime',
      'totals.sumValidatedFlights',
      'totals.validatedOnBlockTimeUtc',
      'totals.verifiedTotalFlightTime',
      'totals.unverifiedTotalFlightTime',
      'totals.unverifiedTotalFlightMins',
      'totals.validatedTotalLandings',
      'totals.totalLandings',
    ])
    .orderBy('aircraftRegistration')
    .orderBy('seqNo', 'desc')

  if (filter.aircraftRegistration) {
    query = query.where('ajlb.aircraftRegistration', '=', filter.aircraftRegistration)
  }

  if (filter.seqNo) {
    query = query.where('ajlb.seqNo', '=', filter.seqNo)
  }

  if (filter.current) {
    query = query.where('endDate', 'is', null)
  }

  if (filter.toDate) {
    query = query.where('endDate', '<=', filter.toDate)
  }

  if (filter.fromDate) {
    query = query.where('startDate', '>=', filter.fromDate)
  }

  const results = await query.execute()
  return results.map(mapResultToAjlb)
}

export async function getAjlb(
  registration: string,
  seqNo: number,
): Promise<AircraftJourneyLogBook | undefined> {
  const row = await connection.db
    .selectFrom('flight.aircraftJourneyLogBook as ajlb')
    .leftJoin('flight.vwFlightTimeTotals as totals', (join) =>
      join
        .onRef('ajlb.aircraftRegistration', '=', 'totals.aircraftRegistration')
        .onRef('ajlb.seqNo', '=', 'totals.ajlbSeqNo'),
    )
    .selectAll('ajlb')
    .select([
      'totals.lastPage',
      'totals.newFlightsPage',
      'totals.sumNewTime',
      'totals.sumNewFlights',
      'totals.sumValidatedTime',
      'totals.sumValidatedFlights',
      'totals.validatedOnBlockTimeUtc',
      'totals.verifiedTotalFlightTime',
      'totals.unverifiedTotalFlightTime',
      'totals.unverifiedTotalFlightMins',
      'totals.validatedTotalLandings',
      'totals.totalLandings',
    ])
    .where('ajlb.aircraftRegistration', '=', registration)
    .where('ajlb.seqNo', '=', seqNo)
    .executeTakeFirst()

  return row ? mapResultToAjlb(row) : undefined
}

export async function createAjlb(
  ajlb: Upsert<AircraftJourneyLogBook>,
  jwt: JWTUser,
): Promise<void> {
  const now = new Date()
  await connection.db
    .insertInto('flight.aircraftJourneyLogBook')
    .values({
      aircraftRegistration: ajlb.aircraftRegistration,
      seqNo: ajlb.seqNo,
      startFlightMins: ajlb.startFlightMins,
      startLandings: ajlb.startLandings,
      noOfPages: ajlb.noOfPages,
      rowsPerPage: ajlb.rowsPerPage,
      startPage: ajlb.startPage,
      startDate: ajlb.startDate,
      endDate: ajlb.endDate,
      ...auditCreate(jwt, now),
    })
    .execute()
}

export async function deleteAjlb(aircraft_registration: string, seq_no: number): Promise<boolean> {
  const result = await connection.db
    .deleteFrom('flight.aircraftJourneyLogBook')
    .where('aircraftRegistration', '=', aircraft_registration)
    .where('seqNo', '=', seq_no)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows === 1n
}

export async function updateAjlb(
  aircraft_registration: string,
  seq_no: number,
  ajlb: Partial<AircraftJourneyLogBook>,
  jwt: JWTUser,
): Promise<AircraftJourneyLogBook | undefined> {
  const result = await connection.db
    .updateTable('flight.aircraftJourneyLogBook')
    .set({
      aircraftRegistration: ajlb.aircraftRegistration,
      seqNo: ajlb.seqNo,
      startFlightMins: ajlb.startFlightMins,
      startLandings: ajlb.startLandings,
      noOfPages: ajlb.noOfPages,
      rowsPerPage: ajlb.rowsPerPage,
      startPage: ajlb.startPage,
      startDate: ajlb.startDate,
      endDate: ajlb.endDate,
      ...auditUpdate(jwt),
    })
    .where('aircraftRegistration', '=', aircraft_registration)
    .where('seqNo', '=', seq_no)
    .executeTakeFirstOrThrow()

  if (!result.numUpdatedRows) {
    return undefined
  }
  return await getAjlb(aircraft_registration, seq_no)
}

export async function getAircraftLandingsBaseline(
  aircraftRegistration: string,
): Promise<AircraftLandingsBaseline | undefined> {
  const row = await connection.db
    .selectFrom('flight.aircraftLandingsBaseline')
    .selectAll()
    .where('aircraftRegistration', '=', aircraftRegistration)
    .executeTakeFirst()

  if (!row) return undefined

  // createdBy / updatedBy are nullable in the schema (ON DELETE SET NULL on the member
  // FK) and are passed through as NULL. They used to be coerced with `?? ''`, which
  // reported a member id of '' for a baseline whose author had been deleted.
  return {
    aircraftRegistration: row.aircraftRegistration,
    baselineLandings: row.baselineLandings,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }
}

export async function setAircraftLandingsBaseline(
  aircraftRegistration: string,
  baselineLandings: number,
  jwt: JWTUser,
): Promise<void> {
  const now = new Date()
  await connection.db.transaction().execute(async (trx) => {
    // Insert or update baseline
    await trx
      .insertInto('flight.aircraftLandingsBaseline')
      .values({
        aircraftRegistration,
        baselineLandings,
        ...auditCreate(jwt, now),
      })
      .onConflict((oc) =>
        oc.column('aircraftRegistration').doUpdateSet((eb) => ({
          baselineLandings: eb.ref('excluded.baselineLandings'),
          updatedBy: eb.ref('excluded.updatedBy'),
          updatedAt: eb.ref('excluded.updatedAt'),
        })),
      )
      .execute()

    await backfillLandingsFromBaseline(trx, aircraftRegistration)
  })
}

/**
 * Three statements of recursive-CTE and window-function SQL, kept verbatim from the
 * `pool.query` version they replaced — only the `$1` placeholders and the executor
 * changed. Raw SQL text is never touched by the identifier transformer, so the
 * snake_case column names in here are correct and must stay; rewriting them as query
 * builder calls would be a behaviour change dressed up as a refactor.
 */
async function backfillLandingsFromBaseline(
  trx: Transaction<DB>,
  aircraftRegistration: string,
): Promise<void> {
  // Step 1: Update first logbook's start_landings to baseline
  await sql`
    WITH first_logbook AS (
      SELECT seq_no FROM flight.aircraft_journey_log_book 
      WHERE aircraft_registration = ${aircraftRegistration}
      ORDER BY seq_no ASC LIMIT 1
    ),
    baseline_val AS (
      SELECT baseline_landings FROM flight.aircraft_landings_baseline
      WHERE aircraft_registration = ${aircraftRegistration}
    )
    UPDATE flight.aircraft_journey_log_book
    SET start_landings = (SELECT baseline_landings FROM baseline_val)
    WHERE aircraft_registration = ${aircraftRegistration}
      AND seq_no = (SELECT seq_no FROM first_logbook)
    `.execute(trx)

  // Step 2: Update subsequent logbooks using a recursive CTE so each logbook's
  // start_landings correctly accumulates across 3+ logbooks in sequence.
  await sql`
    WITH RECURSIVE logbook_chain AS (
      SELECT
        ajlb.seq_no,
        ajlb.start_landings AS new_start_landings,
        COALESCE(
          (SELECT SUM(l.number_of_landings)::int
           FROM flight.logs l
           WHERE l.aircraft_registration = ${aircraftRegistration}
             AND l.ajlb_seq_no = ajlb.seq_no
             AND l.status != 'NEW'),
          0
        ) AS landings_in_book
      FROM flight.aircraft_journey_log_book ajlb
      WHERE ajlb.aircraft_registration = ${aircraftRegistration}
        AND ajlb.seq_no = (
          SELECT MIN(seq_no) FROM flight.aircraft_journey_log_book WHERE aircraft_registration = ${aircraftRegistration}
        )
      UNION ALL
      SELECT
        next_ajlb.seq_no,
        (lc.new_start_landings + lc.landings_in_book)::int,
        COALESCE(
          (SELECT SUM(l.number_of_landings)::int
           FROM flight.logs l
           WHERE l.aircraft_registration = ${aircraftRegistration}
             AND l.ajlb_seq_no = next_ajlb.seq_no
             AND l.status != 'NEW'),
          0
        )
      FROM logbook_chain lc
      JOIN flight.aircraft_journey_log_book next_ajlb
        ON next_ajlb.aircraft_registration = ${aircraftRegistration}
        AND next_ajlb.seq_no = (
          SELECT MIN(seq_no) FROM flight.aircraft_journey_log_book
          WHERE aircraft_registration = ${aircraftRegistration} AND seq_no > lc.seq_no
        )
    )
    UPDATE flight.aircraft_journey_log_book ajlb
    SET start_landings = lc.new_start_landings
    FROM logbook_chain lc
    WHERE ajlb.aircraft_registration = ${aircraftRegistration}
      AND ajlb.seq_no = lc.seq_no
      AND lc.seq_no != (
        SELECT MIN(seq_no) FROM flight.aircraft_journey_log_book WHERE aircraft_registration = ${aircraftRegistration}
      )
    `.execute(trx)

  // Step 3: Recalculate flight landing totals for all flights
  await sql`
    UPDATE flight.logs
    SET ajlb_total_landings = cumulative.total_landings
    FROM (
      SELECT
        l.flight_id,
        ajlb.start_landings + SUM(l.number_of_landings) OVER (
          PARTITION BY l.aircraft_registration, l.ajlb_seq_no
          ORDER BY l.off_block_time_epoch
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS total_landings
      FROM flight.logs l
      JOIN flight.aircraft_journey_log_book ajlb
        ON ajlb.aircraft_registration = l.aircraft_registration
        AND ajlb.seq_no = l.ajlb_seq_no
      WHERE l.aircraft_registration = ${aircraftRegistration} AND l.status != 'NEW'
    ) cumulative
    WHERE flight.logs.flight_id = cumulative.flight_id
    `.execute(trx)
}

export async function deleteAircraftLandingsBaseline(
  aircraftRegistration: string,
): Promise<boolean> {
  return await connection.db.transaction().execute(async (trx) => {
    const result = await trx
      .deleteFrom('flight.aircraftLandingsBaseline')
      .where('aircraftRegistration', '=', aircraftRegistration)
      .executeTakeFirst()

    const removed = (result?.numDeletedRows ?? 0n) > 0n
    if (removed) {
      await trx
        .updateTable('flight.aircraftJourneyLogBook')
        .set({ startLandings: 0 })
        .where('aircraftRegistration', '=', aircraftRegistration)
        .execute()
      await trx
        .updateTable('flight.logs')
        .set({ ajlbTotalLandings: null })
        .where('aircraftRegistration', '=', aircraftRegistration)
        .execute()
    }

    return removed
  })
}
