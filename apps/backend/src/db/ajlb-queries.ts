import * as connection from './connection.ts'
import type { AjlbFilter, AircraftJourneyLogBook } from '../routes/ajlb/model.ts'
import type { FlightAircraftJourneyLogBook, FlightVwFlightTimeTotals } from './schema.js'
import type { Selectable } from 'kysely'
import type { Upsert } from '../types/schema.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type { PoolClient } from 'pg'

const mapResultToAjlb = (
  row: Selectable<
    FlightAircraftJourneyLogBook &
      Pick<
        FlightVwFlightTimeTotals,
        | 'last_page'
        | 'new_flights_page'
        | 'sum_new_time'
        | 'sum_new_flights'
        | 'sum_validated_time'
        | 'sum_validated_flights'
        | 'validated_on_block_time_utc'
        | 'verified_total_flight_time'
        | 'unverified_total_flight_time'
        | 'validated_total_landings'
        | 'total_landings'
      >
  >,
): AircraftJourneyLogBook => ({
  seqNo: row.seq_no,
  aircraftRegistration: row.aircraft_registration,
  startFlightMins: row.start_flight_mins,
  startFlightTime: row.start_flight_time,
  startLandings: row.start_landings,
  noOfPages: row.no_of_pages,
  rowsPerPage: row.rows_per_page,
  startPage: row.start_page,
  startDate: row.start_date,
  endDate: row.end_date ? row.end_date : null,
  view: {
    lastPage: row.last_page ?? 0,
    newFlightsPage: row.new_flights_page,
    newFlightsCount: row.sum_new_flights ?? 0,
    newFlightsTime: row.sum_new_time ?? '00:00',
    validatedBeforeUTC: row.validated_on_block_time_utc?.toISOString() ?? null,
    verifiedTotalFlightTime: row.verified_total_flight_time ?? '00:00',
    unverifiedTotalFlightTime: row.unverified_total_flight_time ?? '00:00',
    validatedFlightsCount: row.sum_validated_flights ?? 0,
    validatedFlightsTime: row.sum_validated_time ?? '00:00',
    validatedTotalLandings: row.validated_total_landings ?? 0,
    totalLandings: row.total_landings ?? 0,
  },

  updatedAt: row.updated_at?.toISOString(),
  updatedBy: row.updated_by,
  createdAt: row.created_at?.toISOString(),
  createdBy: row.created_by,
})

export async function getAjlbs(filter: AjlbFilter): Promise<AircraftJourneyLogBook[]> {
  let query = connection.db
    .selectFrom('flight.aircraft_journey_log_book as ajlb')
    .leftJoin('flight.vw_flight_time_totals as totals', (join) =>
      join
        .onRef('ajlb.aircraft_registration', '=', 'totals.aircraft_registration')
        .onRef('ajlb.seq_no', '=', 'totals.ajlb_seq_no'),
    )
    .selectAll('ajlb')
    .select([
      'totals.last_page',
      'totals.new_flights_page',
      'totals.sum_new_time',
      'totals.sum_new_flights',
      'totals.sum_validated_time',
      'totals.sum_validated_flights',
      'totals.validated_on_block_time_utc',
      'totals.verified_total_flight_time',
      'totals.unverified_total_flight_time',
      'totals.validated_total_landings',
      'totals.total_landings',
    ])
    .orderBy('aircraft_registration')
    .orderBy('seq_no', 'desc')

  if (filter.aircraftRegistration) {
    query = query.where('ajlb.aircraft_registration', '=', filter.aircraftRegistration)
  }

  if (filter.seqNo) {
    query = query.where('ajlb.seq_no', '=', filter.seqNo)
  }

  if (filter.current) {
    query = query.where('end_date', 'is', null)
  }

  if (filter.toDate) {
    query = query.where('end_date', '<=', filter.toDate)
  }

  if (filter.fromDate) {
    query = query.where('start_date', '>=', filter.fromDate)
  }

  const results = await query.execute()
  return results.map(mapResultToAjlb)
}

export async function getAjlb(
  registration: string,
  seqNo: number,
): Promise<AircraftJourneyLogBook | undefined> {
  const row = await connection.db
    .selectFrom('flight.aircraft_journey_log_book as ajlb')
    .leftJoin('flight.vw_flight_time_totals as totals', (join) =>
      join
        .onRef('ajlb.aircraft_registration', '=', 'totals.aircraft_registration')
        .onRef('ajlb.seq_no', '=', 'totals.ajlb_seq_no'),
    )
    .selectAll('ajlb')
    .select([
      'totals.last_page',
      'totals.new_flights_page',
      'totals.sum_new_time',
      'totals.sum_new_flights',
      'totals.sum_validated_time',
      'totals.sum_validated_flights',
      'totals.validated_on_block_time_utc',
      'totals.verified_total_flight_time',
      'totals.unverified_total_flight_time',
      'totals.validated_total_landings',
      'totals.total_landings',
    ])
    .where('ajlb.aircraft_registration', '=', registration)
    .where('ajlb.seq_no', '=', seqNo)
    .executeTakeFirst()

  return row ? mapResultToAjlb(row) : undefined
}

export async function createAjlb(
  ajlb: Upsert<AircraftJourneyLogBook>,
  jwt: JWTUser,
): Promise<void> {
  const now = new Date()
  await connection.db
    .insertInto('flight.aircraft_journey_log_book')
    .values({
      aircraft_registration: ajlb.aircraftRegistration,
      seq_no: ajlb.seqNo,
      start_flight_mins: ajlb.startFlightMins,
      start_landings: ajlb.startLandings,
      no_of_pages: ajlb.noOfPages,
      rows_per_page: ajlb.rowsPerPage,
      start_page: ajlb.startPage,
      start_date: ajlb.startDate,
      end_date: ajlb.endDate,
      created_by: jwt.memberId!,
      created_at: now,
      updated_by: jwt.memberId!,
      updated_at: now,
    })
    .execute()
}

export async function deleteAjlb(aircraft_registration: string, seq_no: number): Promise<boolean> {
  const result = await connection.db
    .deleteFrom('flight.aircraft_journey_log_book')
    .where('aircraft_registration', '=', aircraft_registration)
    .where('seq_no', '=', seq_no)
    .executeTakeFirstOrThrow()
  return result.numDeletedRows == BigInt(1)
}

export async function updateAjlb(
  aircraft_registration: string,
  seq_no: number,
  ajlb: Partial<AircraftJourneyLogBook>,
  jwt: JWTUser,
): Promise<AircraftJourneyLogBook | undefined> {
  const result = await connection.db
    .updateTable('flight.aircraft_journey_log_book')
    .set({
      aircraft_registration: ajlb.aircraftRegistration,
      seq_no: ajlb.seqNo,
      start_flight_mins: ajlb.startFlightMins,
      start_landings: ajlb.startLandings,
      no_of_pages: ajlb.noOfPages,
      rows_per_page: ajlb.rowsPerPage,
      start_page: ajlb.startPage,
      start_date: ajlb.startDate,
      end_date: ajlb.endDate,
      updated_by: jwt.memberId!,
      updated_at: new Date(),
    })
    .where('aircraft_registration', '=', aircraft_registration)
    .where('seq_no', '=', seq_no)
    .executeTakeFirstOrThrow()

  if (!result.numUpdatedRows) {
    return undefined
  }
  return await getAjlb(aircraft_registration, seq_no)
}

export async function getAircraftLandingsBaseline(aircraftRegistration: string): Promise<
  | {
      aircraftRegistration: string
      baselineLandings: number
      createdAt: string
      createdBy: string
      updatedAt: string
      updatedBy: string
    }
  | undefined
> {
  const result = await connection.pool.query(
    `SELECT 
       aircraft_registration as "aircraftRegistration",
       baseline_landings as "baselineLandings",
       created_at as "createdAt",
       created_by as "createdBy",
       updated_at as "updatedAt",
       updated_by as "updatedBy"
     FROM flight.aircraft_landings_baseline 
     WHERE aircraft_registration = $1`,
    [aircraftRegistration],
  )

  if (!result.rows[0]) return undefined

  const row = result.rows[0]
  return {
    aircraftRegistration: row.aircraftRegistration,
    baselineLandings: row.baselineLandings,
    createdAt: row.createdAt?.toISOString() ?? '',
    createdBy: row.createdBy ?? '',
    updatedAt: row.updatedAt?.toISOString() ?? '',
    updatedBy: row.updatedBy ?? '',
  }
}

export async function setAircraftLandingsBaseline(
  aircraftRegistration: string,
  baselineLandings: number,
  jwt: JWTUser,
): Promise<void> {
  const now = new Date()
  const client = await connection.pool.connect()
  try {
    await client.query('BEGIN')

    // Insert or update baseline
    await client.query(
      `INSERT INTO flight.aircraft_landings_baseline 
       (aircraft_registration, baseline_landings, created_by, created_at, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (aircraft_registration) DO UPDATE SET
         baseline_landings = $2,
         updated_by = $5,
         updated_at = $6`,
      [aircraftRegistration, baselineLandings, jwt.memberId!, now, jwt.memberId!, now],
    )

    await backfillLandingsFromBaseline(client, aircraftRegistration)

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function backfillLandingsFromBaseline(
  client: PoolClient,
  aircraftRegistration: string,
): Promise<void> {
  // Step 1: Update first logbook's start_landings to baseline
  await client.query(
    `
    WITH first_logbook AS (
      SELECT seq_no FROM flight.aircraft_journey_log_book 
      WHERE aircraft_registration = $1
      ORDER BY seq_no ASC LIMIT 1
    ),
    baseline_val AS (
      SELECT baseline_landings FROM flight.aircraft_landings_baseline
      WHERE aircraft_registration = $1
    )
    UPDATE flight.aircraft_journey_log_book
    SET start_landings = (SELECT baseline_landings FROM baseline_val)
    WHERE aircraft_registration = $1
      AND seq_no = (SELECT seq_no FROM first_logbook)
    `,
    [aircraftRegistration],
  )

  // Step 2: Update subsequent logbooks based on previous logbook totals
  await client.query(
    `
    WITH logbook_prev AS (
      SELECT 
        aircraft_registration,
        seq_no,
        LAG(seq_no) OVER (PARTITION BY aircraft_registration ORDER BY seq_no) as prev_seq_no
      FROM flight.aircraft_journey_log_book
      WHERE aircraft_registration = $1
    ),
    prev_totals AS (
      SELECT
        lp.aircraft_registration,
        lp.seq_no,
        ajlb_prev.start_landings + COALESCE(
          (SELECT SUM(number_of_landings) 
           FROM flight.logs 
           WHERE aircraft_registration = $1
             AND ajlb_seq_no = lp.prev_seq_no
             AND status != 'NEW'),
          0
        ) as calculated_start_landings
      FROM logbook_prev lp
      JOIN flight.aircraft_journey_log_book ajlb_prev 
        ON ajlb_prev.aircraft_registration = lp.aircraft_registration
        AND ajlb_prev.seq_no = lp.prev_seq_no
      WHERE lp.prev_seq_no IS NOT NULL
    )
    UPDATE flight.aircraft_journey_log_book ajlb
    SET start_landings = pt.calculated_start_landings
    FROM prev_totals pt
    WHERE ajlb.aircraft_registration = pt.aircraft_registration
      AND ajlb.seq_no = pt.seq_no
    `,
    [aircraftRegistration],
  )

  // Step 3: Recalculate flight landing totals for all flights
  await client.query(
    `
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
      WHERE l.aircraft_registration = $1 AND l.status != 'NEW'
    ) cumulative
    WHERE flight.logs.flight_id = cumulative.flight_id
    `,
    [aircraftRegistration],
  )
}

export async function deleteAircraftLandingsBaseline(
  aircraftRegistration: string,
): Promise<boolean> {
  const result = await connection.pool.query(
    'DELETE FROM flight.aircraft_landings_baseline WHERE aircraft_registration = $1',
    [aircraftRegistration],
  )
  return (result.rowCount ?? 0) > 0
}
