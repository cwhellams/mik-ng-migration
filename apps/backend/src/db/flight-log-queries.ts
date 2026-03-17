import { db } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import {
  type FlightLogFilters,
  type FlightLog,
  type FlightTimeTotals,
  type FlightLogMemberRequest,
  type FlightLogListResponse,
  FlightLogStatus,
  type FlightLogListEntry,
  type FlightLogUpsertRequest,
  type InvoicableFlight,
  type InvoicableFlightListResponse,
  type InvoicableFlightFilters,
  FlightType,
  type PrivOrComFlight,
  type FlightLogMigrationRequest,
  InvoicableFlights,
  type FlightLogStats,
  type FlightCredit,
} from '../routes/flight-log/models.ts'
import type { MIKPermissions } from '../routes/members/models.ts'
import { generateShortId } from '../util/nanoId.ts'
import type { DB, FlightLogs, FlightVwFlightLogs } from './schema.js'
import {
  sql,
  type ExpressionBuilder,
  type Selectable,
  type StringReference,
  type UpdateObject,
} from 'kysely'
import dayjs from 'dayjs'
import { randomUUID } from 'node:crypto'
import { SimplbooksEventType } from '../services/simplbooks/models.ts'
import { toLocal } from '../util/date.ts'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'

function mapFullResultToFlightLogs(
  row: Selectable<
    FlightLogs & Pick<FlightVwFlightLogs, 'ac_total_flight_time' | 'page_number' | 'row_number'>
  >,
): FlightLog {
  return {
    acTotalFlightTime: row.ajlb_total_flight_time ?? row.ac_total_flight_time ?? '00:00',
    aircraftRegistration: row.aircraft_registration,
    ajlbBlankRowsBefore: row.ajlb_blank_rows_before,
    ajlbSeqNo: row.ajlb_seq_no,
    ajlbPageNo: row.ajlb_page_number ?? row.page_number ?? 0,
    ajlbRowNo: row.ajlb_row_number ?? row.row_number ?? 0,
    arrivalAirport: row.arrival_airport,
    billableMemberId: row.billable_member_id,
    billingRemarks: row.billing_remarks,
    blockMins: row.block_mins,
    blockTime: row.block_time,
    crew2LastName: row.crew2_last_name,
    crew2MemberId: row.crew2_member_id,
    crew2Role: row.crew2_role,
    crew3LastName: row.crew3_last_name,
    crew3MemberId: row.crew3_member_id,
    crew3Role: row.crew3_role,
    crew4LastName: row.crew4_last_name,
    crew4MemberId: row.crew4_member_id,
    crew4Role: row.crew4_role,
    departureAirport: row.departure_airport,
    flightId: row.flight_id,
    flightMins: row.flight_mins,
    flightTime: row.flight_time,
    flightType: row.flight_type as FlightType,
    fuelRemainingLitres: row.fuel_remaining_litres,
    fuelUpliftLitres: row.fuel_uplift_litres,
    incidentOrObservations: row.incident_or_observations,
    instrumentFlyingMins: row.instrument_flying_mins,
    invoiceNumber: row.invoice_number,
    isBillableFlight: row.is_billable_flight,
    isBilled: row.is_billed,
    isDtoTrainingFlight: row.is_dto_training_flight,
    partiallyBillableFlight: row.partially_billable_flight ?? false,
    entryErrorFee: row.entry_error_fee ?? false,
    entryErrorFeeAppliedByMemberId: row.entry_error_fee_applied_by_member_id,
    landingTimeEpoch: row.landing_time_epoch,
    landingTimeUtc: row.landing_time_utc.toISOString(),
    nightFlyingMins: row.night_flying_mins,
    nonBillingApprovedByMemberId: row.non_billing_approved_by_member_id,
    nonBillingReason: row.non_billing_reason,
    validationRemarks: row.validation_remarks,
    numberOfLandings: row.number_of_landings,
    numberOfNightLandings: row.number_of_night_landings,
    offBlockTimeEpoch: row.off_block_time_epoch,
    offBlockTimeUtc: row.off_block_time_utc.toISOString(),
    oilUpliftLitres: row.oil_uplift_litres,
    onBlockTimeEpoch: row.on_block_time_epoch,
    onBlockTimeUtc: row.on_block_time_utc.toISOString(),
    personalRemarks: row.personal_remarks,
    personsOnBoard: row.persons_on_board,
    picLastName: row.pic_last_name,
    picMemberId: row.pic_member_id,
    picRole: row.pic_role,
    privOrComFlight: row.priv_or_com_flight as PrivOrComFlight,
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
  let res = await db
    .selectFrom('flight.logs')
    .leftJoin('flight.vw_flight_logs as totals', 'flight.logs.flight_id', 'totals.flight_id')
    .selectAll('flight.logs')
    .select(['totals.ac_total_flight_time', 'totals.page_number', 'totals.row_number'])
    .where('flight.logs.flight_id', '=', flightId)
    .executeTakeFirst()

  if (res != undefined) {
    return mapFullResultToFlightLogs(res)
  }
}

export async function getFlightLogs(filters: FlightLogFilters): Promise<FlightLogListResponse> {
  const ajlbPaging = !!filters.ajlbSeqNo && filters.page !== undefined

  const query = db
    .selectFrom('flight.logs')
    .leftJoin('flight.vw_flight_logs as totals', 'flight.logs.flight_id', 'totals.flight_id')
    .$if(!!filters.flightId, qb => qb.where('flight.logs.flight_id', '=', filters.flightId!))
    .$if(!!filters.billableMemberId, qb =>
      qb.where('billable_member_id', '=', filters.billableMemberId!),
    )
    .$if(!!filters.pic, qb => qb.where('pic_member_id', '=', filters.pic!))
    .$if(!!filters.crew2, qb => qb.where('crew2_member_id', '=', filters.crew2!))
    .$if(!!filters.crew3, qb => qb.where('crew3_member_id', '=', filters.crew3!))
    .$if(!!filters.crew4, qb => qb.where('crew4_member_id', '=', filters.crew4!))
    .$if(!!filters.aircraftRegistration, qb =>
      qb.where('aircraft_registration', '=', filters.aircraftRegistration!),
    )
    .$if(!!filters.startDate, qb =>
      qb.where('off_block_time_epoch', '>=', toLocal(filters.startDate!).unix().toString()),
    )
    .$if(!!filters.endDate, qb =>
      qb.where('on_block_time_epoch', '<=', dayjs(filters.endDate).endOf('day').unix().toString()),
    )
    .$if(!!filters.status, qb => qb.where('status', '=', filters.status!))
    .$if(!!filters.incidentsOrObservations, qb =>
      qb.where('incident_or_observations', 'is not', null),
    )
    .$if(ajlbPaging, qb =>
      qb
        .where('ajlb_seq_no', '=', filters.ajlbSeqNo!)
        .where(eb =>
          eb('flight.logs.ajlb_page_number', '=', filters.page!).or(
            'totals.page_number',
            '=',
            filters.page!,
          ),
        ),
    )

  // Calculate the total number of rows in the result set.
  // This have to be separate query so that we can do
  // dynamic paging (no ajlb page)
  const { rows } = await query
    .select(eb => eb.fn.countAll<number>().as('rows'))
    .executeTakeFirstOrThrow()

  const pageSize = filters.limit ?? 50
  // when using dynamic paging, get the total number of pages
  const pages = ajlbPaging ? undefined : Math.ceil(rows / pageSize)
  // if page is not defined, use the last page
  const page = filters.page ?? pages ?? 1

  const results = await query
    .select([
      'flight.logs.aircraft_registration',
      'flight.logs.ajlb_blank_rows_before',
      'flight.logs.ajlb_seq_no',
      'flight.logs.ajlb_total_flight_time',
      'flight.logs.ajlb_page_number',
      'flight.logs.ajlb_row_number',
      'flight.logs.arrival_airport',
      'flight.logs.billable_member_id',
      'flight.logs.block_time',
      'flight.logs.crew2_last_name',
      'flight.logs.departure_airport',
      'flight.logs.flight_id',
      'flight.logs.flight_time',
      'flight.logs.flight_type',
      'flight.logs.fuel_remaining_litres',
      'flight.logs.fuel_uplift_litres',
      'flight.logs.incident_or_observations',
      'flight.logs.instrument_flying_mins',
      'flight.logs.night_flying_mins',
      'flight.logs.number_of_landings',
      'flight.logs.number_of_night_landings',
      'flight.logs.oil_uplift_litres',
      'flight.logs.off_block_time_utc',
      'flight.logs.on_block_time_utc',
      'flight.logs.takeoff_time_utc',
      'flight.logs.landing_time_utc',
      'flight.logs.persons_on_board',
      'flight.logs.pic_last_name',
      'flight.logs.status',
      'flight.logs.total_time_in_service',
    ])
    .select(['totals.ac_total_flight_time', 'totals.row_number', 'totals.page_number'])
    .orderBy('off_block_time_epoch', filters.orderLatestFirst ? 'desc' : 'asc')
    // offset only valid with dynamic paging
    .offset(!ajlbPaging && page > 0 ? pageSize * (page - 1) : 0)
    .limit(pageSize)
    .execute()

  return {
    logs: results.map(row => {
      const res: FlightLogListEntry = {
        acTotalFlightTime: row.ajlb_total_flight_time ?? row.ac_total_flight_time ?? '00:00',
        aircraftRegistration: row.aircraft_registration,
        ajlbBlankRowsBefore: row.ajlb_blank_rows_before,
        ajlbSeqNo: row.ajlb_seq_no,
        ajlbRowNo: row.ajlb_row_number ?? row.row_number ?? 1,
        arrivalAirport: row.arrival_airport,
        billableMemberId: row.billable_member_id,
        blockTime: row.block_time,
        crew2LastName: row.crew2_last_name,
        departureAirport: row.departure_airport,
        flightId: row.flight_id,
        flightTime: row.flight_time,
        flightType: row.flight_type as FlightType,
        fuelRemainingLitres: row.fuel_remaining_litres,
        fuelUpliftLitres: row.fuel_uplift_litres,
        incidentOrObservations: row.incident_or_observations,
        instrumentFlyingMins: row.instrument_flying_mins,
        nightFlyingMins: row.night_flying_mins,
        numberOfLandings: row.number_of_landings,
        numberOfNightLandings: row.number_of_night_landings,
        oilUpliftLitres: row.oil_uplift_litres,
        offBlockTimeUtc: row.off_block_time_utc.toISOString(),
        takeoffTimeUtc: row.takeoff_time_utc.toISOString(),
        landingTimeUtc: row.landing_time_utc.toISOString(),
        onBlockTimeUtc: row.on_block_time_utc.toISOString(),
        personsOnBoard: row.persons_on_board,
        picLastName: row.pic_last_name,
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

const sumIfMonths = (
  eb: ExpressionBuilder<DB, 'flight.logs'>,
  months: number,
  ref: StringReference<DB, 'flight.logs'>,
) =>
  eb.cast<number>(
    eb.fn.sum(
      eb
        .case()
        .when(
          sql<boolean>`flight.logs.takeoff_time_utc >= now() - (${months} * interval '1 month')`,
        )
        .then(eb.ref(ref))
        .else(0)
        .end(),
    ),
    'integer',
  )

export async function getFlightStats(
  billableMemberId: string,
  activeOnly: boolean,
): Promise<FlightLogStats[]> {
  const res = await db
    .selectFrom('flight.logs')
    .select(eb => [
      'flight.logs.aircraft_registration as aircraftRegistration',
      eb.fn.max<Date>('flight.logs.takeoff_time_utc').as('lastTakeoffTimeUtc'),
      eb
        .selectFrom('flight.logs as last_flight')
        .select('flight_id')
        .whereRef('flight.logs.aircraft_registration', '=', 'last_flight.aircraft_registration')
        .where('last_flight.billable_member_id', '=', billableMemberId)
        .orderBy('last_flight.takeoff_time_utc', 'desc')
        .limit(1)
        .as('lastFlightId'),
      eb.cast<number>(eb.fn.count<number>('flight.logs.flight_id'), 'integer').as('totalFlights'),
      eb.cast<number>(eb.fn.sum('flight.logs.flight_mins'), 'integer').as('totalFlightMins'),
      eb.cast<number>(eb.fn.sum('flight.logs.number_of_landings'), 'integer').as('totalLandings'),

      sumIfMonths(eb, 1, 'flight.logs.flight_mins').as('time1month'),
      sumIfMonths(eb, 3, 'flight.logs.flight_mins').as('time3month'),
      sumIfMonths(eb, 6, 'flight.logs.flight_mins').as('time6month'),
      sumIfMonths(eb, 12, 'flight.logs.flight_mins').as('time12month'),

      sumIfMonths(eb, 1, 'flight.logs.number_of_landings').as('landings1month'),
      sumIfMonths(eb, 3, 'flight.logs.number_of_landings').as('landings3month'),
      sumIfMonths(eb, 6, 'flight.logs.number_of_landings').as('landings6month'),
      sumIfMonths(eb, 12, 'flight.logs.number_of_landings').as('landings12month'),
    ])
    .where('billable_member_id', '=', billableMemberId)
    .$if(activeOnly === true, qb =>
      qb.where(eb =>
        eb(
          'flight.logs.aircraft_registration',
          'in',
          eb
            .selectFrom('flight.aircraft')
            .select('flight.aircraft.registration')
            .where('active', '=', true),
        ),
      ),
    )
    .groupBy(['flight.logs.aircraft_registration', 'flight.logs.billable_member_id'])
    .execute()

  return res.map(row => ({
    ...row,
    lastTakeoffTimeUtc: row.lastTakeoffTimeUtc.toISOString(),
  }))
}

export async function getInvoicableFlights(
  filters: InvoicableFlightFilters,
): Promise<InvoicableFlightListResponse> {
  let query = db
    .selectFrom('flight.logs')
    .leftJoin('member.register', 'flight.logs.billable_member_id', 'member.register.member_id')
    .leftJoin('flight.flight_credits', 'flight.logs.flight_id', 'flight.flight_credits.flight_id')
    .where('status', '=', FlightLogStatus.VALIDATED)
    .$if(!!filters.aircraftRegistration, qb =>
      qb.where('aircraft_registration', '=', filters.aircraftRegistration),
    )
    .where('on_block_time_epoch', '<=', toLocal(filters.endDate).endOf('day').unix().toString())

  if (filters.flights === InvoicableFlights.FERRY) {
    query = query.where('flight_type', '=', FlightType.FERRY)
  } else if (filters.flights === InvoicableFlights.TEST_FLIGHT) {
    query = query.where('flight_type', '=', FlightType.TEST_FLIGHT)
  } else if (filters.flights === InvoicableFlights.COMMENT) {
    query = query.where('billing_remarks', 'is not', null)
    query = query.where('flight.logs.entry_error_fee', '=', false)
    query = query.where('flight_type', 'not in', [FlightType.FERRY, FlightType.TEST_FLIGHT])
  } else if (filters.flights === InvoicableFlights.ENTRY_ERROR) {
    query = query.where('flight.logs.entry_error_fee', '=', true)
  } else if (filters.flights === InvoicableFlights.PARTIALLY_BILLABLE) {
    query = query.where('flight.logs.partially_billable_flight', '=', true)
  } else if (filters.flights === InvoicableFlights.MIN_BILLABLE) {
    const minMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20
    query = query.where(eb =>
      eb(
        eb
          .case()
          .when('member.register.is_training_program_pilot', '=', true)
          .then(eb.ref('flight.logs.block_mins'))
          .else(eb.ref('flight.logs.flight_mins'))
          .end(),
        '<',
        minMins,
      ),
    )
  } else if (filters.flights === InvoicableFlights.OTHER) {
    const minMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20
    query = query
      .where('billing_remarks', 'is', null)
      .where('flight.logs.partially_billable_flight', 'is not', true)
      .where('flight.logs.entry_error_fee', '=', false)
      .where('flight_type', 'not in', [FlightType.FERRY, FlightType.TEST_FLIGHT])
      .where(eb =>
        eb(
          eb
            .case()
            .when('member.register.is_training_program_pilot', '=', true)
            .then(eb.ref('flight.logs.block_mins'))
            .else(eb.ref('flight.logs.flight_mins'))
            .end(),
          '>=',
          minMins,
        ),
      )
  }

  const { rows } = await query
    .select(eb => eb.fn.countAll<number>().as('rows'))
    .executeTakeFirstOrThrow()

  const pageSize = filters.limit ?? 50
  // get the total number of pages
  const pages = Math.max(1, Math.ceil(rows / pageSize))
  // if page is not defined, use the last page
  const page = filters.page ?? pages ?? 1

  const results = await query
    .select([
      'flight.logs.aircraft_registration',
      'flight.logs.arrival_airport',
      'flight.logs.billable_member_id',
      'flight.logs.billing_remarks',
      'flight.logs.departure_airport',
      'flight.logs.flight_id',
      'flight.logs.flight_time',
      'flight.logs.flight_type',
      'flight.logs.fuel_uplift_litres',
      'flight.logs.is_billable_flight',
      'flight.logs.non_billing_reason',
      'flight.logs.flight_mins',
      'flight.logs.block_mins',
      'flight.logs.block_time',
      'flight.logs.number_of_landings',
      'flight.logs.takeoff_time_utc',
      'flight.logs.landing_time_utc',
      'flight.logs.persons_on_board',
      'flight.logs.pic_last_name',
      'flight.logs.status',
      'flight.logs.partially_billable_flight',
      'flight.logs.entry_error_fee',
      'member.register.last_name as billable_member_last_name',
      'member.register.is_training_program_pilot',
      'member.register.billing_id',
      'flight.flight_credits.credited_mins',
      'flight.flight_credits.note',
      'flight.logs.validation_remarks',
    ])
    .orderBy('off_block_time_epoch', 'asc')
    .offset(pageSize * (page - 1))
    .limit(pageSize)
    .execute()

  return {
    logs: results.map(row => {
      const res: InvoicableFlight = {
        aircraftRegistration: row.aircraft_registration,
        arrivalAirport: row.arrival_airport,
        billableMemberId: row.billable_member_id,
        billableMemberLastName: row.billable_member_last_name,
        billingId: row.billing_id,
        isTrainingProgramPilot: row.is_training_program_pilot,
        billingRemarks: row.billing_remarks,
        departureAirport: row.departure_airport,
        flightId: row.flight_id,
        flightTime: row.flight_time,
        flightMins: row.flight_mins,
        blockMins: row.block_mins,
        blockTime: row.block_time,
        flightType: row.flight_type as FlightType,
        fuelUpliftLitres: row.fuel_uplift_litres,
        isBillableFlight: row.is_billable_flight,
        nonBillingReason: row.non_billing_reason,
        numberOfLandings: row.number_of_landings,
        takeoffTimeUtc: row.takeoff_time_utc.toISOString(),
        landingTimeUtc: row.landing_time_utc.toISOString(),
        personsOnBoard: row.persons_on_board,
        picLastName: row.pic_last_name,
        status: row.status as FlightLogStatus,
        partiallyBillableFlight: row.partially_billable_flight ?? false,
        entryErrorFee: row.entry_error_fee ?? false,
        creditedMins: row.credited_mins ?? null,
        creditedNote: row.note ?? null,
        validationRemarks: row.validation_remarks ?? null,
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
  data: FlightLogMemberRequest | FlightLogUpsertRequest | FlightLogMigrationRequest,
  user: { memberId: string; permissions: MIKPermissions[] },
): Promise<string> {
  // admins can bill flights to other members
  const billableMemberId = 'billableMemberId' in data ? data.billableMemberId : user.memberId

  // determine if this is a DTO training flight
  const isDtoTrainingFlight =
    'isDtoTrainingFlight' in data
      ? data.isDtoTrainingFlight
      : (
          await db
            .selectFrom('member.register')
            .select('is_training_program_pilot')
            .where('member_id', '=', billableMemberId)
            .limit(1)
            .executeTakeFirstOrThrow()
        ).is_training_program_pilot

  // DTO training flights always have flight type DTO
  const flightType = isDtoTrainingFlight ? FlightType.DTO : data.flightType

  const retval = await db
    .insertInto('flight.logs')
    .values(eb => ({
      aircraft_registration: data.aircraftRegistration,
      arrival_airport: data.arrivalAirport,
      billable_member_id: billableMemberId,
      billing_remarks: data.billingRemarks,
      pic_last_name: eb
        .selectFrom('member.register')
        .select('last_name')
        .where('member_id', '=', data.picMemberId),
      pic_member_id: data.picMemberId,
      pic_role: data.picRole,
      crew2_last_name: eb
        .selectFrom('member.register')
        .select('last_name')
        .where('member_id', '=', data.crew2MemberId),
      crew2_member_id: data.crew2MemberId,
      crew2_role: data.crew2Role,
      crew3_last_name: eb
        .selectFrom('member.register')
        .select('last_name')
        .where('member_id', '=', data.crew3MemberId),
      crew3_member_id: data.crew3MemberId,
      crew3_role: data.crew3Role,
      crew4_last_name: eb
        .selectFrom('member.register')
        .select('last_name')
        .where('member_id', '=', data.crew4MemberId),
      crew4_member_id: data.crew4MemberId,
      crew4_role: data.crew4Role,
      departure_airport: data.departureAirport,
      flight_type: flightType,
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
      priv_or_com_flight: flightTypeToPrivOrCom(flightType),
      total_time_in_service: data.totalTimeInService,

      // only for the migration
      invoice_number: 'invoiceNumber' in data ? data.invoiceNumber : undefined,
      is_billable_flight: 'isBillableFlight' in data ? data.isBillableFlight : true,
      partially_billable_flight: data.partiallyBillableFlight ?? false,
      entry_error_fee: 'entryErrorFee' in data ? (data.entryErrorFee ?? false) : false,
      entry_error_fee_applied_by_member_id:
        // For migration imports, honor the supplied member ID; for all regular inserts,
        // derive it from the current user when an entry error fee is applied.
        'entryErrorFeeAppliedByMemberId' in data
          ? data.entryErrorFeeAppliedByMemberId
          : 'entryErrorFee' in data && data.entryErrorFee
            ? user.memberId
            : null,
      non_billing_approved_by_member_id:
        // For migration imports, honor the supplied member ID; for all regular inserts,
        // derive it from the current user when the flight is marked non-billable.
        'nonBillingApprovedByMemberId' in data
          ? data.nonBillingApprovedByMemberId
          : 'isBillableFlight' in data && data.isBillableFlight === false
            ? user.memberId
            : null,
      validation_remarks: 'validationRemarks' in data ? data.validationRemarks : null,

      ajlb_blank_rows_before: 'ajlbBlankRowsBefore' in data ? data.ajlbBlankRowsBefore : 0,
      ajlb_seq_no:
        // For migration imports, use the supplied ajlbSeqNo; for all regular inserts
        // (admin or member), always auto-detect from the current open AJLB so that a
        // hardcoded frontend default can never land the flight in the wrong book.
        'isDtoTrainingFlight' in data && data.ajlbSeqNo
          ? data.ajlbSeqNo
          : eb
              .selectFrom('flight.vw_flight_time_totals')
              .select(eb.fn.coalesce('ajlb_seq_no', eb.lit(0)).as('ajlb_seq_no'))
              .where('aircraft_registration', '=', data.aircraftRegistration)
              .where('current', '=', true),
      flight_id: generateShortId(),
      created_by: user.memberId,
      created_at: new Date().toISOString(),
      updated_by: user.memberId,
      updated_at: new Date().toISOString(),
      is_dto_training_flight: isDtoTrainingFlight,
    }))
    .returning('flight_id')
    .executeTakeFirstOrThrow()

  return retval.flight_id
}

export async function deleteFlightLog(flight_id: string): Promise<boolean> {
  let delQuery = db
    .deleteFrom('flight.logs')
    .where('flight_id', '=', flight_id)
    .where('status', '=', FlightLogStatus.NEW)

  const retval = await delQuery.executeTakeFirst()
  return retval.numDeletedRows == 1n
}

const flightTypeToPrivOrCom = (type: FlightType): PrivOrComFlight => {
  switch (type) {
    case FlightType.SCHOOL:
    case FlightType.DTO:
    case FlightType.CHECKFLIGHT:
    case FlightType.SAR:
      return 'C'
    default:
      return 'P'
  }
}

export const updateFlightLog = async (
  flight_id: string,
  data: Partial<FlightLogUpsertRequest>,
  user: JWTUser,
): Promise<boolean> =>
  updateFlightLogWithAudit(flight_id, user, eb => ({
    aircraft_registration: data.aircraftRegistration,
    arrival_airport: data.arrivalAirport,
    billable_member_id: data.billableMemberId,
    billing_remarks: data.billingRemarks,
    pic_last_name: data.picMemberId
      ? eb
          .selectFrom('member.register')
          .select('last_name')
          .where('member_id', '=', data.picMemberId)
      : undefined,
    pic_member_id: data.picMemberId,
    pic_role: data.picRole,
    crew2_last_name: data.crew2MemberId
      ? eb
          .selectFrom('member.register')
          .select('last_name')
          .where('member_id', '=', data.crew2MemberId)
      : undefined,
    crew2_member_id: data.crew2MemberId,
    crew2_role: data.crew2Role,
    crew3_last_name: data.crew3MemberId
      ? eb
          .selectFrom('member.register')
          .select('last_name')
          .where('member_id', '=', data.crew3MemberId)
      : undefined,
    crew3_member_id: data.crew3MemberId,
    crew3_role: data.crew3Role,
    crew4_last_name: data.crew4MemberId
      ? eb
          .selectFrom('member.register')
          .select('last_name')
          .where('member_id', '=', data.crew4MemberId)
      : undefined,
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
    priv_or_com_flight: data.flightType ? flightTypeToPrivOrCom(data.flightType) : undefined,
    total_time_in_service: data.totalTimeInService,

    // admin fields are editable
    ajlb_blank_rows_before: data.ajlbBlankRowsBefore,
    ajlb_seq_no: data.ajlbSeqNo,
    is_billable_flight: data.isBillableFlight,
    partially_billable_flight: data.partiallyBillableFlight ?? false,
    entry_error_fee: data.entryErrorFee ?? undefined,
    entry_error_fee_applied_by_member_id:
      data.entryErrorFee === undefined ? undefined : data.entryErrorFee ? user.memberId : null,
    non_billing_approved_by_member_id:
      data.isBillableFlight === undefined
        ? undefined
        : data.isBillableFlight === false
          ? user.memberId
          : null,
    non_billing_reason: data.nonBillingReason,
    validation_remarks: data.validationRemarks,

    is_dto_training_flight: data.billableMemberId
      ? eb
          .selectFrom('member.register')
          .select('is_training_program_pilot')
          .where('member_id', '=', data.billableMemberId)
          .limit(1)
      : undefined,
  }))

export const updateFlightLogStatus = async (
  flightId: string,
  oldStatus: FlightLogStatus,
  newStatus: FlightLogStatus,
  patch: Partial<FlightLog>,
  user: JWTUser,
): Promise<boolean> => {
  switch (newStatus) {
    case FlightLogStatus.NEW:
      // reset ajlb values back to null
      return updateFlightLogWithAudit(flightId, user, () => ({
        status: newStatus,
        ajlb_total_flight_mins: null,
        ajlb_page_number: null,
        ajlb_row_number: null,
      }))
    case FlightLogStatus.VALIDATED:
      // copy values from the view
      return updateFlightLogWithAudit(flightId, user, eb => ({
        status: newStatus,
        ...(oldStatus == FlightLogStatus.NEW
          ? {
              ajlb_total_flight_mins: eb
                .selectFrom('flight.vw_flight_logs')
                .select('ac_total_flight_mins')
                .where('flight_id', '=', flightId),
              ajlb_page_number: eb
                .selectFrom('flight.vw_flight_logs')
                .select('page_number')
                .where('flight_id', '=', flightId),
              ajlb_row_number: eb
                .selectFrom('flight.vw_flight_logs')
                .select('row_number')
                .where('flight_id', '=', flightId),
            }
          : {}),
      }))
    default:
      // update only the status
      return updateFlightLogWithAudit(flightId, user, () => ({
        status: newStatus,
      }))
  }
}

export const invoiceFlights = async (flights: InvoicableFlight[]): Promise<void> => {
  // send all billable flights to simplbooks invoicing through outbox
  // and mark the corresponding flight logs as QUEUED_FOR_INVOICING in the same transaction
  await db.transaction().execute(async trx => {
    const now = new Date()
    // Mark flights as invoiced so they are not selected again by getInvoicableFlights
    for (const flight of flights) {
      // Assuming InvoicableFlight contains the flight's identifier as `flightId`
      await trx
        .updateTable('flight.logs')
        .set({
          status: FlightLogStatus.QUEUED_FOR_INVOICING,
          updated_at: now,
          updated_by: MIK_SIMPLBOOKS_MEMBER,
        })
        .where('flight_id', '=', flight.flightId)
        .execute()
    }
    // Enqueue the outbox message with the original flights payload
    await trx
      .insertInto('accts.outbox_simplbooks')
      .values({
        id: randomUUID(),
        event_type: SimplbooksEventType.FLIGHT_INVOICE,
        payload: structuredClone({ flights }),
      })
      .execute()
  })
}

const updateFlightLogWithAudit = async (
  flight_id: string,
  user: JWTUser,
  update: (eb: ExpressionBuilder<DB, 'flight.logs'>) => UpdateObject<DB, 'flight.logs'>,
): Promise<boolean> => {
  let updQuery = db
    .updateTable('flight.logs')
    .set(update)
    .set({
      updated_by: user.memberId,
      updated_at: new Date(),
    })
    .where('flight_id', '=', flight_id)

  const retval = await updQuery.executeTakeFirst()
  return retval.numUpdatedRows == 1n
}

export async function getFlightLogTotals(registration?: string): Promise<FlightTimeTotals[]> {
  let query = db
    .selectFrom('flight.vw_flight_time_totals')
    .selectAll()
    .where('current', '=', true)
    .orderBy('aircraft_registration')

  if (registration) {
    query = query.where('aircraft_registration', '=', registration)
  }
  const results = await query.execute()
  return results.map(row => ({
    // there are no nullable values in the view, it is safe to use ! operator
    acTotalFlightTime: row.unverified_total_flight_time!,
    acTotalFlightHours: row.unverified_total_flight_hours!,
    aircraftRegistration: row.aircraft_registration!,
    ajlbSeqNo: row.ajlb_seq_no!,
  }))
}

export async function getFlightCredit(flightId: string): Promise<FlightCredit | null> {
  const row = await db
    .selectFrom('flight.flight_credits')
    .select(['flight_id', 'credited_mins', 'note'])
    .where('flight_id', '=', flightId)
    .executeTakeFirst()

  if (!row) return null

  return {
    flightId: row.flight_id,
    creditedMins: row.credited_mins,
    note: row.note,
  }
}

export async function upsertFlightCredit(
  flightId: string,
  creditedMins: number,
  note: string | null,
  allocatedByMemberId: string,
): Promise<FlightCredit> {
  const now = new Date()
  await db
    .insertInto('flight.flight_credits')
    .values({
      flight_id: flightId,
      credited_mins: creditedMins,
      note,
      allocated_by_member_id: allocatedByMemberId,
      created_at: now,
      updated_at: now,
    })
    .onConflict(oc =>
      oc.column('flight_id').doUpdateSet({
        credited_mins: creditedMins,
        note,
        allocated_by_member_id: allocatedByMemberId,
        updated_at: now,
      }),
    )
    .execute()

  return { flightId, creditedMins, note }
}
