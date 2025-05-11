import * as connection from './connection.ts'
import type { AjlbFilter, AircraftJourneyLogBook } from '../routes/ajlb/model.ts'
import type { FlightAircraftJourneyLogBook } from './schema.js'
import type { Selectable } from 'kysely'

function mapResultToAjlb(
  results: Selectable<FlightAircraftJourneyLogBook>[],
): AircraftJourneyLogBook[] {
  return results.map((row: Selectable<FlightAircraftJourneyLogBook>) => ({
    seqNo: row.seq_no,
    aircraftRegistration: row.aircraft_registration,
    minutesAtStart: row.minutes_at_start,
    noOfPages: row.no_of_pages,
    rowsPerPage: row.rows_per_page,
    startPage: row.start_page,
    startDate: row.start_date,
    endDate: row.end_date ? row.end_date : null,
    flightTime: row.flight_time,
  }))
}

// Get all aircraft
export async function getAllAjlbs(): Promise<AircraftJourneyLogBook[]> {
  const results = await connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .orderBy('aircraft_registration')
    .orderBy('seq_no')
    .execute()

  return mapResultToAjlb(results)
}

export async function getCurrentAjlbs(): Promise<AircraftJourneyLogBook[]> {
  const results = await connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .where('end_date', 'is', null)
    .orderBy('aircraft_registration')
    .orderBy('seq_no')
    .execute()

  return mapResultToAjlb(results)
}

export async function getFilteredAjlbs(filter: AjlbFilter): Promise<AircraftJourneyLogBook[]> {
  let query = connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .orderBy('aircraft_registration')
    .orderBy('seq_no')

  if (filter.aircraftRegistration) {
    query = query.where('aircraft_registration', '=', filter.aircraftRegistration)
  }

  if (filter.seqNo) {
    query = query.where('seq_no', '=', filter.seqNo)
  }

  if (filter.toDate) {
    query = query.where('end_date', '<=', filter.toDate)
  }

  if (filter.fromDate) {
    query = query.where('start_date', '>=', filter.fromDate)
  }

  const results = await query.execute()

  return mapResultToAjlb(results)
}

export async function createNextSequentialAjlbForAircraft(
  ajlb: AircraftJourneyLogBook,
): Promise<void> {
  await connection.db
    .insertInto('flight.aircraft_journey_log_book')
    .values({
      aircraft_registration: ajlb.aircraftRegistration,
      seq_no: ajlb.seqNo,
      minutes_at_start: ajlb.minutesAtStart,
      no_of_pages: ajlb.noOfPages,
      rows_per_page: ajlb.rowsPerPage,
      start_page: ajlb.startPage,
      start_date: ajlb.startDate,
      end_date: ajlb.endDate,
    })
    .execute()
}

export async function deleteAjlb(aircraft_registration: string, seq_no: number): Promise<void> {
  await connection.db
    .deleteFrom('flight.aircraft_journey_log_book')
    .where('aircraft_registration', '=', aircraft_registration)
    .where('seq_no', '=', seq_no)
    .execute()
}

export async function updateAjlb(
  aircraft_registration: string,
  seq_no: number,
  ajlb: AircraftJourneyLogBook,
): Promise<void> {
  await connection.db
    .updateTable('flight.aircraft_journey_log_book')
    .set({
      aircraft_registration: ajlb.aircraftRegistration,
      seq_no: ajlb.seqNo,
      minutes_at_start: ajlb.minutesAtStart,
      no_of_pages: ajlb.noOfPages,
      rows_per_page: ajlb.rowsPerPage,
      start_page: ajlb.startPage,
      start_date: ajlb.startDate,
      end_date: ajlb.endDate,
    })
    .where('aircraft_registration', '=', aircraft_registration)
    .where('seq_no', '=', seq_no)
    .execute()
}
