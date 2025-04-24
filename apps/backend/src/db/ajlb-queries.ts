import * as connection from './connection.ts'
import type { AjlbFilter, FlightAircraftJourneyLogBook } from '../routes/ajlb/model.ts'

function mapResultToAjlb(results: any): FlightAircraftJourneyLogBook[] {
  return (results as any[]).map((row: any) => ({
    ...row,
    start_date: row.start_date,
    end_date: row.end_date ? row.end_date : null,
  }))
}

// Get all aircraft
export async function getAllAjlbs(): Promise<FlightAircraftJourneyLogBook[]> {
  const results = await connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .orderBy('aircraft_registration')
    .orderBy('seq_no')
    .execute()

  return mapResultToAjlb(results)
}

export async function getCurrentAjlbs(): Promise<FlightAircraftJourneyLogBook[]> {
  const results = await connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .where('end_date', 'is', null)
    .orderBy('aircraft_registration')
    .orderBy('seq_no')
    .execute()

  return mapResultToAjlb(results)
}

export async function getFilteredAjlbs(
  filter: AjlbFilter,
): Promise<FlightAircraftJourneyLogBook[]> {
  let query = connection.db
    .selectFrom('flight.aircraft_journey_log_book')
    .selectAll()
    .orderBy('aircraft_registration')
    .orderBy('seq_no')

  if (filter.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filter.aircraft_registration)
  }

  if (filter.seq_no) {
    query = query.where('seq_no', '=', filter.seq_no)
  }

  if (filter.to_date) {
    query = query.where('end_date', '<=', new Date(filter.to_date))
  }

  if (filter.from_date) {
    query = query.where('start_date', '>=', new Date(filter.from_date))
  }

  const results = await query.execute()

  return mapResultToAjlb(results)
}

export async function createNextSequentialAjlbForAircraft(
  ajlb: FlightAircraftJourneyLogBook,
): Promise<void> {
  await connection.db.insertInto('flight.aircraft_journey_log_book').values(ajlb).execute()
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
  ajlb: FlightAircraftJourneyLogBook,
): Promise<void> {
  await connection.db
    .updateTable('flight.aircraft_journey_log_book')
    .set(ajlb)
    .where('aircraft_registration', '=', aircraft_registration)
    .where('seq_no', '=', seq_no)
    .execute()
}
