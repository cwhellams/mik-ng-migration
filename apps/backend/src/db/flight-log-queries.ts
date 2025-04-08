import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  FlightLogFilters,
  FlightLogInsertRequest,
  FlightLogUpdateRequest,
  FlightLog,
} from '../routes/flight-log/models.ts'

// Get all flight logs with optional filters
export async function getAllFlightLogs(filters: FlightLogFilters): Promise<FlightLog[]> {
  let query = db
    .selectFrom('flight.logs')
    .select([
      'flight_id',
      'billable_member_id',
      'captain_member_id',
      'copilot_member_id',
      'is_billable_flight',
      'non_billing_approved_by_member_id',
      'non_billing_reason',
      'is_billed',

      'captain',
      'copilot',
      'aircraft_registration',
      'on_block_time_utc',
      'off_block_time_utc',
      'takeoff_time_utc',
      'landing_time_utc',
      'oil_uplift_litres',
      'fuel_uplift_litres',
      'persons_on_board',
      'number_of_landings',
      'night_hours',
      'instrument_hours',
      'departure_airport',
      'arrival_airport',
      'invoice_number',
      'is_billed',
      'flight_type',
      'billing_remarks',
      'remarks',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
    ])
    .orderBy('off_block_time_utc')

  // Apply filters dynamically
  if (filters.flight_id) {
    query = query.where('flight_id', '=', filters.flight_id)
  }

  if (filters.member_id) {
    query = query.where('billable_member_id', '=', filters.member_id)
  }

  if (filters.captain) {
    query = query.where('captain', '=', filters.captain)
  }
  if (filters.copilot) {
    query = query.where('copilot', '=', filters.copilot)
  }
  if (filters.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }
  if (filters.startDate && filters.endDate) {
    query = query
      .where('off_block_time_utc', '>=', filters.startDate)
      .where('on_block_time_utc', '<=', filters.endDate)
  } else if (filters.startDate) {
    query = query.where('off_block_time_utc', '>=', filters.startDate)
  } else if (filters.endDate) {
    query = query.where('on_block_time_utc', '<=', filters.endDate)
  }

  var retval = await query.execute()

  return retval.map(log => log)
}

export async function insertFlightLog(data: FlightLogInsertRequest): Promise<number> {
  const retval = await db
    .insertInto('flight.logs')
    .values(data)
    .returning('flight_id')
    .executeTakeFirstOrThrow()

  return retval.flight_id
}

export async function deleteFlightLog(flight_id: number): Promise<bigint> {
  let delQuery = db
    .deleteFrom('flight.logs')
    .where('flight_id', '=', flight_id)
    .where('is_billed', '=', false)

  var retval = await delQuery.executeTakeFirst()
  return retval.numDeletedRows
}

export async function updateFlightLog(
  flight_id: number,
  data: FlightLogUpdateRequest,
  user: JWTUser,
): Promise<bigint> {
  let updQuery = db
    .updateTable('flight.logs')
    .set({ ...data, updated_by: user?.memberId, updated_at: new Date() })
    .where('flight_id', '=', flight_id)
    .where('is_billed', '=', false)

  var retval = await updQuery.executeTakeFirst()
  return retval.numUpdatedRows
}

// Get all aircraft
export async function getAllAircraft() {
  return db.selectFrom('flight.aircraft').selectAll().orderBy('display_name').execute()
}

// Get aircraft by registration
export async function getAircraftByRegistration(registration: string) {
  return db
    .selectFrom('flight.aircraft')
    .selectAll()
    .where('registration', '=', registration)
    .executeTakeFirst()
}
