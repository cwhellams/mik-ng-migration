import * as connection from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import type {
  FlightLogFilters,
  FlightLog,
  InsertableFlightLog,
  FlightLogInsertRequest,
  FlightLogUpdateRequest,
  FlightVwFlightTimeTotals,
} from '../routes/flight-log/models.ts'
import type { MIKPermissions } from '../routes/members/models.ts'
import { generateShortId } from '../util/nanoId.ts'

// Get all flight logs with optional filters
export async function getFlightLogs(filters: FlightLogFilters): Promise<FlightLog[]> {
  let query = connection.db
    .selectFrom('flight.logs')
    .select([
      'flight_id',
      'billable_member_id',
      'aircraft_registration',
      'pic_member_id',
      'pic_role',
      'crew2_member_id',
      'crew2_role',
      'crew3_member_id',
      'crew3_role',
      'crew4_member_id',
      'crew4_role',
      'off_block_time_utc',
      'takeoff_time_utc',
      'landing_time_utc',
      'on_block_time_utc',
      'flight_mins',
      'flight_time',
      'block_mins',
      'block_time',
      'oil_uplift_litres',
      'fuel_uplift_litres',
      'fuel_remaining_litres',
      'persons_on_board',
      'number_of_landings',
      'night_flying_mins',
      'instrument_flying_mins',
      'departure_airport',
      'arrival_airport',
      'invoice_number',
      'is_billed',
      'flight_type',
      'billing_remarks',
      'personal_remarks',
      'incident_or_observations',
      'is_billable_flight',
      'non_billing_reason',
      'non_billing_approved_by_member_id',
      'priv_or_com_flight',
      'ajlb_seq_no',
      'ajlb_blank_rows_before',
      'total_time_in_service',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'status',
    ])
    .orderBy('off_block_time_epoch')

  // Apply filters dynamically
  if (filters.flight_id) {
    query = query.where('flight_id', '=', filters.flight_id)
  }

  if (filters.billable_member_id) {
    query = query.where('billable_member_id', '=', filters.billable_member_id)
  }

  if (filters.pic) {
    query = query.where('pic_member_id', '=', filters.pic)
  }
  if (filters.crew2) {
    query = query.where('crew2_member_id', '=', filters.crew2)
  }
  if (filters.crew3) {
    query = query.where('crew3_member_id', '=', filters.crew3)
  }
  if (filters.crew4) {
    query = query.where('crew3_member_id', '=', filters.crew4)
  }

  if (filters.aircraft_registration) {
    query = query.where('aircraft_registration', '=', filters.aircraft_registration)
  }

  if (filters.startDate) {
    query = query.where('off_block_time_epoch', '>=', filters.startDate.toString())
  }
  if (filters.endDate) {
    query = query.where('on_block_time_epoch', '<=', filters.endDate.toString())
  }

  return await query.execute()
}

export async function insertFlightLog(
  data: FlightLogInsertRequest,
  user: { memberId: string; permissions: MIKPermissions[] },
): Promise<string> {
  const insertableData: InsertableFlightLog = {
    ...data,
    flight_id: generateShortId(),
    created_by: user.memberId,
    created_at: new Date().toISOString(),
    updated_by: user.memberId,
    updated_at: new Date().toISOString(),
  }

  const retval = await connection.db
    .insertInto('flight.logs')
    .values(insertableData)
    .returning('flight_id')
    .executeTakeFirstOrThrow()

  return retval.flight_id
}

export async function deleteFlightLog(flight_id: string): Promise<bigint> {
  let delQuery = connection.db
    .deleteFrom('flight.logs')
    .where('flight_id', '=', flight_id)
    .where('is_billed', '=', false)

  const retval = await delQuery.executeTakeFirst()
  return retval.numDeletedRows
}

export async function updateFlightLog(
  flight_id: string,
  data: FlightLogUpdateRequest,
  user: JWTUser,
): Promise<bigint> {
  let updQuery = connection.db
    .updateTable('flight.logs')
    .set({ ...data, updated_by: user?.memberId, updated_at: new Date() })
    .where('flight_id', '=', flight_id)
    .where('is_billed', '=', false)

  const retval = await updQuery.executeTakeFirst()
  return retval.numUpdatedRows
}

export async function getFlightLogTotals(
  registration?: string,
): Promise<FlightVwFlightTimeTotals[]> {
  let query = connection.db.selectFrom('flight.vw_flight_time_totals').selectAll()
  if (registration) {
    query = query.where('aircraft_registration', '=', registration)
  }
  return await query.execute()
}
