import * as connection from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  type FlightLogFilters,
  type FlightLog,
  type FlightTimeTotals,
  type FlightLogMemberRequest,
  type FlightLogListResponse,
  FlightLogStatus,
  type FlightLogListEntry,
} from '../routes/flight-log/models.ts'
import type { MIKPermissions } from '../routes/members/models.ts'
import { generateShortId } from '../util/nanoId.ts'
import type { FlightLogs, FlightVwFlightLogs } from './schema.js'
import type { Selectable } from 'kysely'
import dayjs from 'dayjs'

function mapFullResultToFlightLogs(
  row: Selectable<
    FlightLogs &
      Pick<FlightVwFlightLogs, 'ac_total_flight_time' | 'pic_last_name' | 'crew2_last_name'>
  >,
): FlightLog {
  return {
    acTotalFlightTime: row.ac_total_flight_time ?? '00:00',
    aircraftRegistration: row.aircraft_registration,
    ajlbBlankRowsBefore: row.ajlb_blank_rows_before,
    ajlbSeqNo: row.ajlb_seq_no,
    arrivalAirport: row.arrival_airport,
    billableMemberId: row.billable_member_id,
    billingRemarks: row.billing_remarks,
    blockMins: row.block_mins,
    blockTime: row.block_time,
    crew2LastName: row.crew2_last_name,
    crew2MemberId: row.crew2_member_id,
    crew2Role: row.crew2_role,
    crew3MemberId: row.crew3_member_id,
    crew3Role: row.crew3_role,
    crew4MemberId: row.crew4_member_id,
    crew4Role: row.crew4_role,
    departureAirport: row.departure_airport,
    flightId: row.flight_id,
    flightMins: row.flight_mins,
    flightTime: row.flight_time,
    flightType: row.flight_type,
    fuelRemainingLitres: row.fuel_remaining_litres,
    fuelUpliftLitres: row.fuel_uplift_litres,
    incidentOrObservations: row.incident_or_observations,
    instrumentFlyingMins: row.instrument_flying_mins,
    invoiceNumber: row.invoice_number,
    isBillableFlight: row.is_billable_flight,
    isBilled: row.is_billed,
    isDtoTrainingFlight: row.is_dto_training_flight,
    landingTimeEpoch: row.landing_time_epoch,
    landingTimeUtc: row.landing_time_utc.toISOString(),
    nightFlyingMins: row.night_flying_mins,
    nonBillingApprovedByMemberId: row.non_billing_approved_by_member_id,
    nonBillingReason: row.non_billing_reason,
    numberOfLandings: row.number_of_landings,
    numberOfNightLandings: row.number_of_night_landings,
    offBlockTimeEpoch: row.off_block_time_epoch,
    offBlockTimeUtc: row.off_block_time_utc.toISOString(),
    oilUpliftLitres: row.oil_uplift_litres,
    onBlockTimeEpoch: row.on_block_time_epoch,
    onBlockTimeUtc: row.on_block_time_utc.toISOString(),
    personalRemarks: row.personal_remarks,
    personsOnBoard: row.persons_on_board,
    picLastName: row.pic_last_name ?? row.pic_member_id,
    picMemberId: row.pic_member_id,
    picRole: row.pic_role,
    privOrComFlight: row.priv_or_com_flight,
    status: row.status as FlightLogStatus,
    takeoffTimeEpoch: row.takeoff_time_epoch,
    takeoffTimeUtc: row.takeoff_time_utc.toISOString(),
    totalTimeInService: row.total_time_in_service,

    updatedAt: row.updated_at?.toISOString(),
    updatedBy: row.updated_by,
    createdAt: row.created_at?.toISOString(),
    createdBy: row.created_by,
  }
}

// Get single flight log
export async function getFlightLog(flightId: string): Promise<FlightLog | undefined> {
  let res = await connection.db
    .selectFrom('flight.logs')
    .innerJoin('flight.vw_flight_logs as totals', 'flight.logs.flight_id', 'totals.flight_id')
    .selectAll('flight.logs')
    .select(['totals.ac_total_flight_time', 'totals.pic_last_name', 'totals.crew2_last_name'])
    .where('flight.logs.flight_id', '=', flightId)
    .executeTakeFirst()

  if (res != undefined) {
    return mapFullResultToFlightLogs(res)
  }
}

export async function getFlightLogs(filters: FlightLogFilters): Promise<FlightLogListResponse> {
  let query = connection.db
    .selectFrom('flight.logs')
    .innerJoin('flight.vw_flight_logs as totals', 'flight.logs.flight_id', 'totals.flight_id')

  if (filters.flightId) {
    query = query.where('flight.logs.flight_id', '=', filters.flightId)
  }

  if (filters.billableMemberId) {
    query = query.where('billable_member_id', '=', filters.billableMemberId)
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

  if (filters.aircraftRegistration) {
    query = query.where('aircraft_registration', '=', filters.aircraftRegistration)
  }

  if (filters.startDate) {
    query = query.where('off_block_time_epoch', '>=', dayjs(filters.startDate).unix().toString())
  }
  if (filters.endDate) {
    query = query.where('on_block_time_epoch', '<=', dayjs(filters.endDate).unix().toString())
  }

  if (filters.status) {
    query = query.where('status', '=', filters.status)
  }

  // synch mode fetches physical pages from the ajlb
  const ajlbPaging = filters.ajlbSeqNo && filters.page !== undefined
  if (ajlbPaging) {
    query = query
      .where('ajlb_seq_no', '=', filters.ajlbSeqNo!)
      .where('totals.page_number', '=', filters.page!.toString())
  }

  // Calculate the total number of rows in the result set.
  // This have to be separate query so that we can do
  // dynamic paging (no ajlb page)
  const { rows } = await query
    .select(eb => eb.fn.countAll<number>().as('rows'))
    .executeTakeFirstOrThrow()

  const pageSize = filters.limit ?? 50
  // when using dynamic paging, get the total number of pages
  const pages = !ajlbPaging ? Math.ceil(rows / pageSize) : undefined
  // if page is not defined, use the last page
  const page = filters.page ?? pages ?? 1

  const results = await query
    .select([
      'flight.logs.aircraft_registration',
      'flight.logs.ajlb_blank_rows_before',
      'flight.logs.ajlb_seq_no',
      'flight.logs.arrival_airport',
      'flight.logs.billable_member_id',
      'flight.logs.block_time',
      'flight.logs.departure_airport',
      'flight.logs.flight_id',
      'flight.logs.flight_time',
      'flight.logs.flight_type',
      'flight.logs.fuel_remaining_litres',
      'flight.logs.fuel_uplift_litres',
      'flight.logs.instrument_flying_mins',
      'flight.logs.is_billable_flight',
      'flight.logs.night_flying_mins',
      'flight.logs.number_of_landings',
      'flight.logs.number_of_night_landings',
      'flight.logs.oil_uplift_litres',
      'flight.logs.off_block_time_utc',
      'flight.logs.on_block_time_utc',
      'flight.logs.takeoff_time_utc',
      'flight.logs.landing_time_utc',
      'flight.logs.persons_on_board',
      'flight.logs.pic_member_id',
      'flight.logs.status',
      'flight.logs.total_time_in_service',
    ])
    .select([
      'totals.ac_total_flight_time',
      'totals.row_number',
      'totals.rows_per_page',
      'totals.page_number',
      'totals.pic_last_name',
      'totals.crew2_last_name',
    ])
    .orderBy('off_block_time_epoch', filters.orderLatestFirst ? 'desc' : 'asc')
    // offset only valid with dynamic paging
    .offset(!ajlbPaging && page > 0 ? pageSize * (page - 1) : 0)
    .limit(pageSize)
    .execute()

  return {
    logs: results.map(row => {
      const res: FlightLogListEntry = {
        acTotalFlightTime: row.ac_total_flight_time ?? '00:00',
        aircraftRegistration: row.aircraft_registration,
        ajlbBlankRowsBefore: row.ajlb_blank_rows_before,
        ajlbSeqNo: row.ajlb_seq_no,
        arrivalAirport: row.arrival_airport,
        billableMemberId: row.billable_member_id,
        blockTime: row.block_time,
        crew2LastName: row.crew2_last_name,
        departureAirport: row.departure_airport,
        flightId: row.flight_id,
        flightTime: row.flight_time,
        flightType: row.flight_type,
        fuelRemainingLitres: row.fuel_remaining_litres,
        fuelUpliftLitres: row.fuel_uplift_litres,
        instrumentFlyingMins: row.instrument_flying_mins,
        isBillableFlight: row.is_billable_flight,
        nightFlyingMins: row.night_flying_mins,
        numberOfLandings: row.number_of_landings,
        numberOfNightLandings: row.number_of_night_landings,
        oilUpliftLitres: row.oil_uplift_litres,
        offBlockTimeUtc: row.off_block_time_utc.toISOString(),
        takeoffTimeUtc: row.takeoff_time_utc.toISOString(),
        landingTimeUtc: row.landing_time_utc.toISOString(),
        onBlockTimeUtc: row.on_block_time_utc.toISOString(),
        personsOnBoard: row.persons_on_board,
        picLastName: row.pic_last_name ?? row.pic_member_id,
        status: row.status as FlightLogStatus,
        totalTimeInService: row.total_time_in_service,
      }
      return res
    }),
    page,
    pages,
    rows: Number(rows),
    limit: pageSize,
  }
}

export async function insertFlightLog(
  data: FlightLogMemberRequest,
  user: { memberId: string; permissions: MIKPermissions[] },
): Promise<string> {
  const retval = await connection.db
    .insertInto('flight.logs')
    .values(eb => ({
      aircraft_registration: data.aircraftRegistration,
      arrival_airport: data.arrivalAirport,
      billable_member_id: data.billableMemberId,
      billing_remarks: data.billingRemarks,
      pic_member_id: data.picMemberId,
      pic_role: data.picRole,

      crew2_member_id: data.crew2MemberId,
      crew2_role: data.crew2Role,
      crew3_member_id: data.crew3MemberId,
      crew3_role: data.crew3Role,
      crew4_member_id: data.crew4MemberId,
      crew4_role: data.crew4Role,
      departure_airport: data.departureAirport,
      flight_type: data.flightType,
      fuel_remaining_litres: data.fuelRemainingLitres,
      fuel_uplift_litres: data.fuelUpliftLitres,
      incident_or_observations: data.incidentOrObservations,
      instrument_flying_mins: data.instrumentFlyingMins,
      night_flying_mins: data.nightFlyingMins,
      number_of_landings: data.numberOfLandings,
      number_of_night_landings: data.numberOfNightLandings,
      oil_uplift_litres: data.oilUpliftLitres,
      off_block_time_epoch: data.offBlockTimeEpoch,
      takeoff_time_epoch: data.takeoffTimeEpoch,
      landing_time_epoch: data.landingTimeEpoch,
      on_block_time_epoch: data.onBlockTimeEpoch,
      personal_remarks: data.personalRemarks,
      persons_on_board: data.personsOnBoard,
      priv_or_com_flight: data.privOrComFlight,
      total_time_in_service: data.totalTimeInService,

      is_billable_flight: true,
      ajlb_blank_rows_before: 0,
      ajlb_seq_no: eb
        .selectFrom('flight.vw_flight_time_totals')
        .select(eb.fn.coalesce('ajlb_seq_no', eb.lit(0)).as('ajlb_seq_no'))
        .where('aircraft_registration', '=', data.aircraftRegistration)
        .where('current', '=', true),
      flight_id: generateShortId(),
      created_by: user.memberId,
      created_at: new Date().toISOString(),
      updated_by: user.memberId,
      updated_at: new Date().toISOString(),
      is_dto_training_flight: eb
        .selectFrom('member.register')
        .select('is_training_program_pilot')
        .where('member_id', '=', user.memberId)
        .limit(1),
    }))
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
  data: Partial<FlightLog>,
  user: JWTUser,
): Promise<bigint> {
  let updQuery = connection.db
    .updateTable('flight.logs')
    .set(eb => ({
      aircraft_registration: data.aircraftRegistration,
      arrival_airport: data.arrivalAirport,
      billable_member_id: data.billableMemberId,
      billing_remarks: data.billingRemarks,
      pic_member_id: data.picMemberId,
      pic_role: data.picRole,

      crew2_member_id: data.crew2MemberId,
      crew2_role: data.crew2Role,
      crew3_member_id: data.crew3MemberId,
      crew3_role: data.crew3Role,
      crew4_member_id: data.crew4MemberId,
      crew4_role: data.crew4Role,
      departure_airport: data.departureAirport,
      flight_type: data.flightType,
      fuel_remaining_litres: data.fuelRemainingLitres,
      fuel_uplift_litres: data.fuelUpliftLitres,
      incident_or_observations: data.incidentOrObservations,
      instrument_flying_mins: data.instrumentFlyingMins,
      night_flying_mins: data.nightFlyingMins,
      number_of_landings: data.numberOfLandings,
      number_of_night_landings: data.numberOfNightLandings,
      oil_uplift_litres: data.oilUpliftLitres,
      off_block_time_epoch: data.offBlockTimeEpoch,
      takeoff_time_epoch: data.takeoffTimeEpoch,
      landing_time_epoch: data.landingTimeEpoch,
      on_block_time_epoch: data.onBlockTimeEpoch,
      personal_remarks: data.personalRemarks,
      persons_on_board: data.personsOnBoard,
      priv_or_com_flight: data.privOrComFlight,
      total_time_in_service: data.totalTimeInService,

      // admin fields are editable
      ajlb_blank_rows_before: data.ajlbBlankRowsBefore,
      ajlb_seq_no: data.ajlbSeqNo,
      invoice_number: data.invoiceNumber,
      is_billable_flight: data.isBillableFlight,
      non_billing_approved_by_member_id: data.nonBillingApprovedByMemberId,
      non_billing_reason: data.nonBillingReason,
      status: data.status,

      updated_by: user.memberId,
      updated_at: new Date(),
      is_dto_training_flight: eb
        .selectFrom('member.register')
        .select('is_training_program_pilot')
        .where('member_id', '=', user.memberId)
        .limit(1),
    }))
    .where('flight_id', '=', flight_id)
    .where('is_billed', '=', false)

  const retval = await updQuery.executeTakeFirst()
  return retval.numUpdatedRows
}

export async function getFlightLogTotals(registration?: string): Promise<FlightTimeTotals[]> {
  let query = connection.db
    .selectFrom('flight.vw_flight_time_totals')
    .selectAll()
    .where('current', '=', true)

  if (registration) {
    query = query.where('aircraft_registration', '=', registration)
  }
  const results = await query.execute()
  return results.map(row => ({
    // there are no nullable values in the view, it is safe to use ! operator
    acTotalFlightTime: row.ac_total_flight_time!,
    acTotalFlightHours: row.ac_total_flight_hours!,
    aircraftRegistration: row.aircraft_registration!,
    ajlbSeqNo: row.ajlb_seq_no!,
    flightLogMinsThisAjlb: row.flight_log_mins_this_ajlb!,
    flightTimeThisAjlb: row.flight_time_this_ajlb!,
    totalFlightMinsAtAjlbStart: row.total_flight_mins_at_ajlb_start!,
    totalFlightTimeAtAjlbStart: row.total_flight_time_at_ajlb_start!,
  }))
}
