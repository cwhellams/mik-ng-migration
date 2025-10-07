import * as connection from './connection.ts'
import type { AjlbFilter, AircraftJourneyLogBook } from '../routes/ajlb/model.ts'
import type { FlightAircraftJourneyLogBook, FlightVwFlightTimeTotals } from './schema.js'
import type { Selectable } from 'kysely'
import type { Upsert } from '../types/schema.ts'
import type { JWTUser } from '../routes/auth/token.ts'

const mapResultToAjlb = (
  row: Selectable<
    FlightAircraftJourneyLogBook &
      Pick<
        FlightVwFlightTimeTotals,
        | 'last_page'
        | 'new_flights_page'
        | 'new_flights_time'
        | 'new_flights_count'
        | 'validated_on_block_time_utc'
        | 'validated_total_flight_time'
        | 'ac_total_flight_time'
      >
  >,
): AircraftJourneyLogBook => ({
  seqNo: row.seq_no,
  aircraftRegistration: row.aircraft_registration,
  startFlightMins: row.start_flight_mins,
  startFlightTime: row.start_flight_time,
  noOfPages: row.no_of_pages,
  rowsPerPage: row.rows_per_page,
  startPage: row.start_page,
  startDate: row.start_date,
  endDate: row.end_date ? row.end_date : null,
  view: {
    lastPage: row.last_page ?? 0,
    newFlightsPage: row.new_flights_page,
    newFlightsCount: row.new_flights_count ?? 0,
    newFlightsTime: row.new_flights_time ?? '00:00',
    validatedBeforeUTC: row.validated_on_block_time_utc?.toISOString() ?? null,
    validatedFlightTime: row.validated_total_flight_time ?? '00:00',
    totalFlightTime: row.ac_total_flight_time ?? '00:00',
  },

  updatedAt: row.updated_at?.toISOString(),
  updatedBy: row.updated_by,
  createdAt: row.created_at?.toISOString(),
  createdBy: row.created_by,
})

export async function getAjlbs(filter: AjlbFilter): Promise<AircraftJourneyLogBook[]> {
  let query = connection.db
    .selectFrom('flight.aircraft_journey_log_book as ajlb')
    .leftJoin('flight.vw_flight_time_totals as totals', join =>
      join
        .onRef('ajlb.aircraft_registration', '=', 'totals.aircraft_registration')
        .onRef('ajlb.seq_no', '=', 'totals.ajlb_seq_no'),
    )
    .selectAll('ajlb')
    .select([
      'totals.last_page',
      'totals.new_flights_page',
      'totals.new_flights_time',
      'totals.new_flights_count',
      'totals.validated_on_block_time_utc',
      'totals.validated_total_flight_time',
      'totals.ac_total_flight_time',
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
    .leftJoin('flight.vw_flight_time_totals as totals', join =>
      join
        .onRef('ajlb.aircraft_registration', '=', 'totals.aircraft_registration')
        .onRef('ajlb.seq_no', '=', 'totals.ajlb_seq_no'),
    )
    .selectAll('ajlb')
    .select([
      'totals.last_page',
      'totals.new_flights_page',
      'totals.new_flights_time',
      'totals.new_flights_count',
      'totals.validated_on_block_time_utc',
      'totals.validated_total_flight_time',
      'totals.ac_total_flight_time',
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
