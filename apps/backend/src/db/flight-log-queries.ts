import { auditUpdate } from './audit.ts'
import { db, type DbRow } from './connection.ts'
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
  InvoicableFlights,
  type FlightLogStats,
  type FlightCredit,
  type FlightLogExportFilters,
  type FlightLogExportEntry,
  type FlightLogOverlapConflict,
  type FlightLogOverlapQuery,
  type PageItemRow,
  type CrewRole,
  type FlightLogAuditChange,
  type FlightLogAuditEntry,
  ON_BOARD_CREW_ROLES,
} from '@mik/contracts/flight-log'
import type { MIKPermissions } from '@mik/contracts/members'
import { generateShortId } from '../util/nanoId.ts'
import type { DB } from './schema.d.ts'
import {
  sql,
  type ExpressionBuilder,
  type SqlBool,
  type StringReference,
  type UpdateObject,
} from 'kysely'
import dayjs from 'dayjs'
import { randomUUID } from 'node:crypto'
import { SimplbooksEventType } from '../services/simplbooks/models.ts'
import { toHelsinki } from '@mik/contracts/date'
import { MIK_SIMPLBOOKS_MEMBER } from '../services/simplbooks/simplbooksOutboxHandler.ts'
import type { FlightForEstimation } from '../services/accounting/flightCostEstimator.ts'

// The four AJLB page/total columns come from a join on the flight.vwFlightLogs view,
// so they are not part of the flight.logs row type.
function mapFullResultToFlightLogs(
  row: DbRow<'flight.logs'> &
    Pick<
      DbRow<'flight.vwFlightLogs'>,
      'acTotalFlightTime' | 'acTotalLandings' | 'pageNumber' | 'rowNumber'
    >,
): FlightLog {
  return {
    acTotalFlightTime: row.ajlbTotalFlightTime ?? row.acTotalFlightTime ?? '00:00',
    acTotalLandings: row.ajlbTotalLandings ?? row.acTotalLandings ?? null,
    aircraftRegistration: row.aircraftRegistration,
    ajlbBlankRowsBefore: row.ajlbBlankRowsBefore,
    ajlbSeqNo: row.ajlbSeqNo,
    ajlbPageNo: row.ajlbPageNumber ?? row.pageNumber ?? 0,
    ajlbRowNo: row.ajlbRowNumber ?? row.rowNumber ?? 0,
    ajlbTotalLandings: row.ajlbTotalLandings ?? null,
    arrivalAirport: row.arrivalAirport,
    billableMemberId: row.billableMemberId,
    billingRemarks: row.billingRemarks,
    blockMins: row.blockMins,
    blockTime: row.blockTime,
    crew2LastName: row.crew2LastName,
    crew2MemberId: row.crew2MemberId,
    crew2Role: row.crew2Role,
    crew3LastName: row.crew3LastName,
    crew3MemberId: row.crew3MemberId,
    crew3Role: row.crew3Role,
    crew4LastName: row.crew4LastName,
    crew4MemberId: row.crew4MemberId,
    crew4Role: row.crew4Role,
    departureAirport: row.departureAirport,
    flightId: row.flightId,
    flightMins: row.flightMins,
    flightTime: row.flightTime,
    flightType: row.flightType as FlightType,
    fuelRemainingLitres: row.fuelRemainingLitres,
    fuelUpliftLitres: row.fuelUpliftLitres,
    incidentOrObservations: row.incidentOrObservations,
    instrumentFlyingMins: row.instrumentFlyingMins,
    invoiceNumber: row.invoiceNumber,
    isBillableFlight: row.isBillableFlight,
    isBilled: row.isBilled,
    isDtoTrainingFlight: row.isDtoTrainingFlight,
    partiallyBillableFlight: row.partiallyBillableFlight ?? false,
    entryErrorFee: row.entryErrorFee ?? false,
    entryErrorFeeAppliedByMemberId: row.entryErrorFeeAppliedByMemberId,
    landingTimeEpoch: row.landingTimeEpoch,
    landingTimeUtc: row.landingTimeUtc.toISOString(),
    nightFlyingMins: row.nightFlyingMins,
    nonBillingApprovedByMemberId: row.nonBillingApprovedByMemberId,
    nonBillingReason: row.nonBillingReason,
    minBillableExceptionReason: row.minBillableExceptionReason,
    minBillableExceptionApprovedByMemberId: row.minBillableExceptionApprovedByMemberId,
    validationRemarks: row.validationRemarks,
    numberOfLandings: row.numberOfLandings,
    numberOfNightLandings: row.numberOfNightLandings,
    offBlockTimeEpoch: row.offBlockTimeEpoch,
    offBlockTimeUtc: row.offBlockTimeUtc.toISOString(),
    oilUpliftLitres: row.oilUpliftLitres,
    onBlockTimeEpoch: row.onBlockTimeEpoch,
    onBlockTimeUtc: row.onBlockTimeUtc.toISOString(),
    personalRemarks: row.personalRemarks,
    personsOnBoard: row.personsOnBoard,
    picLastName: row.picLastName,
    picMemberId: row.picMemberId,
    picRole: row.picRole,
    privOrComFlight: row.privOrComFlight as PrivOrComFlight,
    status: row.status as FlightLogStatus,
    takeoffTimeEpoch: row.takeoffTimeEpoch,
    takeoffTimeUtc: row.takeoffTimeUtc.toISOString(),
    totalTimeInService: row.totalTimeInService,

    updatedAt: row.updatedAt?.toISOString(),
    updatedBy: row.updatedBy,
    createdAt: row.createdAt?.toISOString(),
    createdBy: row.createdBy,
  }
}

// Get single flight log
export async function getFlightLog(flightId: string): Promise<FlightLog | undefined> {
  let res = await db
    .selectFrom('flight.logs')
    .leftJoin('flight.vwFlightLogs as totals', 'flight.logs.flightId', 'totals.flightId')
    .selectAll('flight.logs')
    .select([
      'totals.acTotalFlightTime',
      'totals.acTotalLandings',
      'totals.pageNumber',
      'totals.rowNumber',
    ])
    .where('flight.logs.flightId', '=', flightId)
    .executeTakeFirst()

  if (res != undefined) {
    return mapFullResultToFlightLogs(res)
  }
}

/**
 * Which physical logbook page a given running-total flight time (e.g. a
 * flight-log defect's flightMins) falls on. Used to deep-link straight to the
 * right page instead of defaulting to the last one.
 */
export async function getFlightLogPageForMins(
  aircraftRegistration: string,
  ajlbSeqNo: number,
  flightMins: number,
  item?: { itemType: 'note' | 'defect'; itemId: string },
): Promise<number | undefined> {
  // An own-row (rows > 0) note/defect's exact page can only come from the
  // same physical-row breakdown the logbook page itself renders from --
  // approximating via flightMins (below) can't see how many rows earlier
  // items on the page have consumed, and silently lands on the wrong page
  // once that overflows the page. A rows: 0 inline item has no row of its
  // own here, so this falls through to the flightMins heuristic for those.
  if (item) {
    const ownRow = await db
      .selectFrom('flight.vwAjlbLiveRows')
      .select('pageNumber')
      .where('aircraftRegistration', '=', aircraftRegistration)
      .where('ajlbSeqNo', '=', ajlbSeqNo)
      .where('itemType', '=', item.itemType)
      .where('itemId', '=', item.itemId)
      .where('isContentRow', '=', true)
      .executeTakeFirst()
    if (ownRow?.pageNumber != null) return ownRow.pageNumber
  }

  const rows = await db
    .selectFrom('flight.logs')
    .leftJoin('flight.vwFlightLogs as totals', 'flight.logs.flightId', 'totals.flightId')
    .where('aircraftRegistration', '=', aircraftRegistration)
    .where('ajlbSeqNo', '=', ajlbSeqNo)
    .select([
      'flight.logs.ajlbPageNumber',
      'totals.pageNumber',
      'flight.logs.ajlbTotalFlightMins',
      'totals.acTotalFlightMins',
    ])
    .orderBy('offBlockTimeEpoch', 'asc')
    .orderBy('flight.logs.flightId', 'asc')
    .execute()

  if (!rows.length) return undefined

  // The first flight whose running total reaches the target is the one whose
  // page the defect was recorded on; fall back to the last page otherwise.
  const match =
    rows.find((row) => (row.ajlbTotalFlightMins ?? row.acTotalFlightMins ?? 0) >= flightMins) ??
    rows[rows.length - 1]

  return match.ajlbPageNumber ?? match.pageNumber ?? undefined
}

/**
 * The frozen baseline flight_mins for an ajlb: the last VALIDATED flight's
 * total flight mins, or the ajlb's start_flight_mins if nothing has been
 * validated yet. Maintenance notes and pre-flight defects (not tied to a
 * specific flight) may be positioned at or after this value -- they describe
 * "right now" and may legitimately match it exactly. In-flight defects (tied
 * to a specific flight) must be strictly after it, since that flight itself
 * must still be unvalidated. Anything strictly before the baseline belongs to
 * an already-frozen, immutable page (see flight.vw_ajlb_live_sequence, which
 * only reflows notes/defects at or past this same boundary).
 */
export async function getAjlbLiveBaselineFlightMins(
  aircraftRegistration: string,
  ajlbSeqNo: number,
): Promise<number> {
  const row = await db
    .selectFrom('flight.vwFlightTimeTotals')
    .select('validatedTotalFlightMins')
    .where('aircraftRegistration', '=', aircraftRegistration)
    .where('ajlbSeqNo', '=', ajlbSeqNo)
    .executeTakeFirst()

  return row?.validatedTotalFlightMins ?? 0
}

/**
 * Exact physical-row placement of own-row (rows > 0) notes/defects on one ajlb page,
 * from flight.vw_ajlb_live_rows -- see that view for why this can't be derived
 * client-side from flightMins alone (an item's rows can straddle a page boundary).
 */
export async function getAjlbPageItemRows(
  aircraftRegistration: string,
  ajlbSeqNo: number,
  page: number,
): Promise<PageItemRow[]> {
  const rows = await db
    .selectFrom('flight.vwAjlbLiveRows')
    .select(['rowNumber', 'itemType', 'itemId', 'isContentRow'])
    .where('aircraftRegistration', '=', aircraftRegistration)
    .where('ajlbSeqNo', '=', ajlbSeqNo)
    .where('pageNumber', '=', page)
    .orderBy('rowNumber')
    .execute()

  return rows.map((row) => ({
    rowNumber: row.rowNumber!,
    itemType: row.itemType as 'note' | 'defect',
    itemId: row.itemId!,
    isContentRow: row.isContentRow!,
  }))
}

/** The four crew slots, as (member id, role) column pairs in slot order. */
const CREW_SLOTS = [
  ['picMemberId', 'picRole'],
  ['crew2MemberId', 'crew2Role'],
  ['crew3MemberId', 'crew3Role'],
  ['crew4MemberId', 'crew4Role'],
] as const satisfies readonly (readonly [
  StringReference<DB, 'flight.logs'>,
  StringReference<DB, 'flight.logs'>,
])[]

/**
 * `memberId` sat in one of the four crew slots holding an operating role — i.e. the
 * flight belongs in their logbook. The role has to be part of the predicate, not just
 * the slot: an OBS slot means the member was carried, not that they flew (#1019 Q6).
 *
 * Note there is no index on the crew member id columns, so this is a sequential scan
 * over flight.logs. That is the same cost the export has paid since #1068; if the
 * member's own list starts to feel slow, an index is the follow-up.
 */
const onBoardAsCrew = (eb: ExpressionBuilder<DB, 'flight.logs'>, memberId: string) =>
  eb.or(
    CREW_SLOTS.map(([memberIdColumn, roleColumn]) =>
      eb.and([eb(memberIdColumn, '=', memberId), eb(roleColumn, 'in', ON_BOARD_CREW_ROLES)]),
    ),
  )

/**
 * Every flight in `memberId`'s own logbook: the ones billed to them, plus the ones they
 * were on board as operating crew for. An instructor's flight with a student is billed
 * to the student, so the billable half alone is not the member's flying (#1019).
 */
const onBoard = (eb: ExpressionBuilder<DB, 'flight.logs'>, memberId: string) =>
  eb.or([eb('billableMemberId', '=', memberId), onBoardAsCrew(eb, memberId)])

/**
 * The viewer's own role on a row, from whichever crew slot they occupied — null unless
 * that role put them on board as operating crew.
 *
 * The role filter matters even though `onBoard` has already applied it to the query: this
 * also runs over rows no member filter selected (an aircraft logbook page), and over rows
 * selected because the viewer is the billable member while sitting in an OBS slot. Letting
 * OBS through here would have the list mark those rows openable and the detail endpoint —
 * which applies the same rule in `flightAccess.ts` — refuse them.
 */
const myCrewRoleOf = (
  row: {
    picMemberId: string | null
    picRole: string | null
    crew2MemberId: string | null
    crew2Role: string | null
    crew3MemberId: string | null
    crew3Role: string | null
    crew4MemberId: string | null
    crew4Role: string | null
  },
  viewerMemberId: string | undefined,
): CrewRole | null => {
  if (!viewerMemberId) return null
  const slots: [string | null, string | null][] = [
    [row.picMemberId, row.picRole],
    [row.crew2MemberId, row.crew2Role],
    [row.crew3MemberId, row.crew3Role],
    [row.crew4MemberId, row.crew4Role],
  ]
  const mine = slots.find(([memberId]) => memberId === viewerMemberId)
  const role = mine?.[1] as CrewRole | null | undefined
  return role && (ON_BOARD_CREW_ROLES as readonly CrewRole[]).includes(role) ? role : null
}

/**
 * `viewerMemberId` is only ever read by the row mapper, to derive `myCrewRole` /
 * `isOwnFlight` — it does not filter anything, so passing it never changes which rows
 * come back. Filtering to one member's flights is `billableMemberId` or
 * `onBoardMemberId`. Keeping the two apart is what lets the aircraft logbook (AJLB)
 * view mark the rows the viewer happens to have flown without narrowing the page.
 */
export async function getFlightLogs(
  filters: FlightLogFilters,
  viewerMemberId?: string,
): Promise<FlightLogListResponse> {
  const ajlbPaging = !!filters.ajlbSeqNo && filters.page !== undefined

  const query = db
    .selectFrom('flight.logs')
    .leftJoin('flight.vwFlightLogs as totals', 'flight.logs.flightId', 'totals.flightId')
    .$if(!!filters.flightId, (qb) => qb.where('flight.logs.flightId', '=', filters.flightId!))
    .$if(!!filters.billableMemberId, (qb) =>
      qb.where('billableMemberId', '=', filters.billableMemberId!),
    )
    .$if(!!filters.anyCrewMemberId, (qb) =>
      qb.where((eb) =>
        eb('billableMemberId', '=', filters.anyCrewMemberId!)
          .or('picMemberId', '=', filters.anyCrewMemberId!)
          .or('crew2MemberId', '=', filters.anyCrewMemberId!)
          .or('crew3MemberId', '=', filters.anyCrewMemberId!)
          .or('crew4MemberId', '=', filters.anyCrewMemberId!),
      ),
    )
    .$if(!!filters.onBoardMemberId, (qb) => qb.where((eb) => onBoard(eb, filters.onBoardMemberId!)))
    .$if(!!filters.pic, (qb) => qb.where('picMemberId', '=', filters.pic!))
    .$if(!!filters.crew2, (qb) => qb.where('crew2MemberId', '=', filters.crew2!))
    .$if(!!filters.crew3, (qb) => qb.where('crew3MemberId', '=', filters.crew3!))
    .$if(!!filters.crew4, (qb) => qb.where('crew4MemberId', '=', filters.crew4!))
    .$if(!!filters.aircraftRegistration, (qb) =>
      qb.where('aircraftRegistration', '=', filters.aircraftRegistration!),
    )
    .$if(!!filters.startDate, (qb) =>
      qb.where('offBlockTimeEpoch', '>=', toHelsinki(filters.startDate!).unix().toString()),
    )
    .$if(!!filters.endDate, (qb) =>
      qb.where('onBlockTimeEpoch', '<=', dayjs(filters.endDate).endOf('day').unix().toString()),
    )
    .$if(!!filters.status, (qb) => qb.where('status', '=', filters.status!))
    .$if(!!filters.incidentsOrObservations, (qb) =>
      // Backfilled to NULL for legacy whitespace-only rows (V1870); new writes
      // already collapse whitespace-only text to NULL via nullableTrimmedString,
      // so a plain not-null check stays indexable instead of evaluating trim()
      // per row.
      qb.where('incidentOrObservations', 'is not', null),
    )
    .$if(ajlbPaging, (qb) =>
      qb
        .where('ajlbSeqNo', '=', filters.ajlbSeqNo!)
        .where((eb) =>
          eb('flight.logs.ajlbPageNumber', '=', filters.page!).or(
            'totals.pageNumber',
            '=',
            filters.page!,
          ),
        ),
    )

  // Calculate the total number of rows in the result set.
  // This have to be separate query so that we can do
  // dynamic paging (no ajlb page)
  const { rows } = await query
    .select((eb) => eb.fn.countAll<number>().as('rows'))
    .executeTakeFirstOrThrow()

  const pageSize = filters.limit ?? 50
  // when using dynamic paging, get the total number of pages
  const pages = ajlbPaging ? undefined : Math.ceil(rows / pageSize)
  // if page is not defined, use the last page
  const page = filters.page ?? pages ?? 1

  const results = await query
    .select([
      'flight.logs.aircraftRegistration',
      'flight.logs.ajlbBlankRowsBefore',
      'flight.logs.ajlbSeqNo',
      'flight.logs.ajlbTotalFlightTime',
      'flight.logs.ajlbTotalLandings',
      'flight.logs.ajlbPageNumber',
      'flight.logs.ajlbRowNumber',
      'flight.logs.arrivalAirport',
      'flight.logs.billableMemberId',
      'flight.logs.blockMins',
      'flight.logs.blockTime',
      'flight.logs.crew2LastName',
      'flight.logs.departureAirport',
      'flight.logs.flightId',
      'flight.logs.flightMins',
      'flight.logs.flightTime',
      'flight.logs.flightType',
      'flight.logs.fuelRemainingLitres',
      'flight.logs.fuelUpliftLitres',
      'flight.logs.incidentOrObservations',
      'flight.logs.instrumentFlyingMins',
      'flight.logs.invoiceNumber',
      'flight.logs.isBillableFlight',
      'flight.logs.isBilled',
      'flight.logs.minBillableExceptionReason',
      'flight.logs.minBillableExceptionApprovedByMemberId',
      'flight.logs.nightFlyingMins',
      'flight.logs.numberOfLandings',
      'flight.logs.numberOfNightLandings',
      'flight.logs.oilUpliftLitres',
      'flight.logs.offBlockTimeUtc',
      'flight.logs.onBlockTimeUtc',
      'flight.logs.takeoffTimeUtc',
      'flight.logs.landingTimeUtc',
      'flight.logs.personsOnBoard',
      'flight.logs.picLastName',
      'flight.logs.status',
      'flight.logs.totalTimeInService',
      'flight.logs.ajlbTotalFlightMins',
      // Crew slots are selected for the row mapper's benefit only: it turns them into
      // the viewer's own myCrewRole and drops them, so no other member's crew member id
      // reaches the response.
      'flight.logs.picMemberId',
      'flight.logs.picRole',
      'flight.logs.crew2MemberId',
      'flight.logs.crew2Role',
      'flight.logs.crew3MemberId',
      'flight.logs.crew3Role',
      'flight.logs.crew4MemberId',
      'flight.logs.crew4Role',
    ])
    .select([
      'totals.acTotalFlightTime',
      'totals.rowNumber',
      'totals.pageNumber',
      'totals.acTotalFlightMins',
      'totals.acTotalLandings',
    ])
    // flightId is a tiebreaker matching the ORDER BY used by flight.vw_flight_logs'
    // window functions, so ties on off_block_time_epoch resolve the same way here
    // as they do when the view assigns page_number/ac_total_flight_mins.
    .orderBy('offBlockTimeEpoch', filters.orderLatestFirst ? 'desc' : 'asc')
    .orderBy('flightId', filters.orderLatestFirst ? 'desc' : 'asc')
    // offset only valid with dynamic paging
    .offset(!ajlbPaging && page > 0 ? pageSize * (page - 1) : 0)
    .limit(pageSize)
    .execute()

  let pageStartFlightMins: number | null = null
  if (ajlbPaging && filters.page! > 1) {
    const prevPageLastFlight = await db
      .selectFrom('flight.logs')
      .leftJoin('flight.vwFlightLogs as totals', 'flight.logs.flightId', 'totals.flightId')
      .where('ajlbSeqNo', '=', filters.ajlbSeqNo!)
      // A note/defect large enough to fill an entire physical page on its own leaves that
      // page with zero flights (see flight.vw_ajlb_live_sequence) -- looking only at
      // filters.page - 2 would then find nothing and fall back to null, which resets the
      // frontend's lower bound to -1 and makes it re-render every earlier note/defect a
      // second time on this page. Search back to the nearest EARLIER page that actually
      // has a flight instead of assuming it's exactly the immediately preceding one.
      .where(
        sql<SqlBool>`coalesce("flight"."logs"."ajlb_page_number", "totals"."page_number") < ${filters.page!}`,
      )
      .select(['flight.logs.ajlbTotalFlightMins', 'totals.acTotalFlightMins'])
      // flightId tiebreaker keeps this in sync with the view's row ordering (see above)
      // so this reliably finds the true last row of that page even when flights share the
      // same off_block_time_epoch. Both columns must be qualified since 'totals'
      // (flight.vw_flight_logs) also has a flightId column, making the bare reference
      // ambiguous to Postgres.
      .orderBy(sql`coalesce("flight"."logs"."ajlb_page_number", "totals"."page_number")`, 'desc')
      .orderBy('flight.logs.offBlockTimeEpoch', 'desc')
      .orderBy('flight.logs.flightId', 'desc')
      .limit(1)
      .executeTakeFirst()

    pageStartFlightMins =
      prevPageLastFlight?.ajlbTotalFlightMins ?? prevPageLastFlight?.acTotalFlightMins ?? null
  }

  const pageItemRows = ajlbPaging
    ? await getAjlbPageItemRows(filters.aircraftRegistration!, filters.ajlbSeqNo!, filters.page!)
    : undefined

  return {
    logs: results.map((row) => {
      const res: FlightLogListEntry = {
        acTotalFlightTime: row.ajlbTotalFlightTime ?? row.acTotalFlightTime ?? '00:00',
        acTotalLandings: row.ajlbTotalLandings ?? row.acTotalLandings ?? null,
        aircraftRegistration: row.aircraftRegistration,
        ajlbBlankRowsBefore: row.ajlbBlankRowsBefore,
        ajlbSeqNo: row.ajlbSeqNo,
        ajlbRowNo: row.ajlbRowNumber ?? row.rowNumber ?? 1,
        arrivalAirport: row.arrivalAirport,
        billableMemberId: row.billableMemberId,
        blockMins: row.blockMins,
        blockTime: row.blockTime,
        crew2LastName: row.crew2LastName,
        creditedMins: null,
        departureAirport: row.departureAirport,
        estimatedCost: null,
        flightId: row.flightId,
        flightMins: row.flightMins,
        flightTime: row.flightTime,
        flightType: row.flightType as FlightType,
        fuelRemainingLitres: row.fuelRemainingLitres,
        fuelUpliftLitres: row.fuelUpliftLitres,
        incidentOrObservations: row.incidentOrObservations,
        instrumentFlyingMins: row.instrumentFlyingMins,
        invoiceNumber: row.invoiceNumber,
        isBillableFlight: row.isBillableFlight,
        isBilled: row.isBilled,
        isTrainingProgramPilot: null,
        minBillableExceptionReason: row.minBillableExceptionReason ?? null,
        minBillableExceptionApprovedByMemberId: row.minBillableExceptionApprovedByMemberId ?? null,
        nightFlyingMins: row.nightFlyingMins,
        numberOfLandings: row.numberOfLandings,
        numberOfNightLandings: row.numberOfNightLandings,
        oilUpliftLitres: row.oilUpliftLitres,
        offBlockTimeUtc: row.offBlockTimeUtc.toISOString(),
        takeoffTimeUtc: row.takeoffTimeUtc.toISOString(),
        landingTimeUtc: row.landingTimeUtc.toISOString(),
        onBlockTimeUtc: row.onBlockTimeUtc.toISOString(),
        personsOnBoard: row.personsOnBoard,
        picLastName: row.picLastName,
        status: row.status as FlightLogStatus,
        totalTimeInService: row.totalTimeInService,
        acTotalFlightMins: row.ajlbTotalFlightMins ?? row.acTotalFlightMins ?? null,
        myCrewRole: myCrewRoleOf(row, viewerMemberId),
        isOwnFlight: !!viewerMemberId && row.billableMemberId === viewerMemberId,
      }
      return res
    }),
    page,
    pages,
    rows: Number(rows),
    limit: pageSize,
    pageStartFlightMins,
    pageItemRows,
  }
}

/**
 * Columns left out of a flight log's reported change history, and why each is noise
 * rather than a change someone made:
 *
 *  - the audit quadruple is already the trail's own `changedBy` / `changedAt`;
 *  - the `*_epoch` times are the storage form of the four `*_utc` twins, which are
 *    reported instead because a human can read them;
 *  - block/flight durations and the AJLB running totals are recomputed from the times
 *    and the logbook sequence, so they restate an edit rather than being one;
 *  - the `*_last_name` columns are denormalised copies of the crew member rows, and
 *    always move together with the crew member id reported next to them.
 */
const AUDIT_IGNORED_COLUMNS = new Set([
  'flight_id',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'off_block_time_epoch',
  'takeoff_time_epoch',
  'landing_time_epoch',
  'on_block_time_epoch',
  'block_mins',
  'block_time',
  'flight_mins',
  'flight_time',
  'ajlb_total_flight_mins',
  'ajlb_total_flight_time',
  'ajlb_total_landings',
  'ajlb_page_number',
  'ajlb_row_number',
  'pic_last_name',
  'crew2_last_name',
  'crew3_last_name',
  'crew4_last_name',
])

/**
 * The audit snapshots are `to_jsonb(OLD)` / `to_jsonb(NEW)` row dumps, so their keys are
 * the database's own snake_case and stay that way through the camelCase plugin -- which
 * only renames identifiers and, with `maintainNestedObjectKeys`, deliberately leaves the
 * inside of a JSONB value alone (DATA_LAYER.md). Converting here is what puts contract
 * field names in the response.
 */
const columnToField = (column: string): string =>
  column.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())

/** One snapshot value as the single string the UI will print. */
const renderAuditValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

type AuditSnapshot = Record<string, unknown> | null

/** Common shape every `*_audit` table's row selection has, whichever entity it's about. */
interface RelatedAuditRow {
  auditId: number
  operationType: string
  changedAt: Date
  changedBy: string
  changedData: unknown
  newData: unknown
  changedByFirstName: string | null
  changedByLastName: string | null
}

const changedByNameOf = (row: RelatedAuditRow): string | null =>
  row.changedByFirstName && row.changedByLastName
    ? `${row.changedByFirstName} ${row.changedByLastName}`
    : null

/**
 * Field-level diff between two snapshots, shared by every source that reports one:
 * only an UPDATE has two snapshots to compare (an INSERT/DELETE's single snapshot would
 * otherwise list every column as "changed", burying the actual updates).
 */
const diffSnapshots = (
  before: AuditSnapshot,
  after: AuditSnapshot,
  ignoredColumns: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
): FlightLogAuditChange[] =>
  before && after
    ? [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((column) => !ignoredColumns.has(column))
        .filter((column) => !hidden.has(columnToField(column)))
        .filter((column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]))
        .sort()
        .map((column) => ({
          field: columnToField(column),
          before: renderAuditValue(before[column]),
          after: renderAuditValue(after[column]),
        }))
    : []

/**
 * A flight log's own change history, newest first, as field-level diffs.
 *
 * `hiddenFields` are contract field names (camelCase) to leave out entirely — the route
 * passes the same list it strips from the detail response, so a crew member reading the
 * trail of someone else's flight cannot recover through the history what the flight
 * itself withheld (#1019).
 */
async function getFlightLogsAuditEntries(
  flightId: string,
  hidden: ReadonlySet<string>,
): Promise<FlightLogAuditEntry[]> {
  const rows = await db
    .selectFrom('flight.logsAudit as a')
    .leftJoin('member.register as cb', 'cb.memberId', 'a.changedBy')
    .select([
      'a.auditId',
      'a.operationType',
      'a.changedAt',
      'a.changedBy',
      'a.changedData',
      'a.newData',
      'cb.firstName as changedByFirstName',
      'cb.lastName as changedByLastName',
    ])
    .where('a.flightId', '=', flightId)
    // Ordered by the serial key, not by changed_at. That column is a bare `timestamp`
    // defaulted to CURRENT_TIMESTAMP, so its value depends on the TimeZone of whichever
    // session wrote the row -- Flyway's Helsinki-local seed rows and the app's UTC ones
    // are three hours apart on the same clock reading, and sorting by it puts them in the
    // wrong order. audit_id is assigned in insertion order and cannot disagree with it.
    .orderBy('a.auditId', 'desc')
    .execute()

  return rows.map((row) => ({
    auditId: row.auditId,
    source: 'flightLog' as const,
    operationType: row.operationType as FlightLogAuditEntry['operationType'],
    changedBy: row.changedBy,
    changedByName: changedByNameOf(row),
    changedAt: row.changedAt.toISOString(),
    changes: diffSnapshots(
      row.changedData as AuditSnapshot,
      row.newData as AuditSnapshot,
      AUDIT_IGNORED_COLUMNS,
      hidden,
    ),
  }))
}

const DEFECT_AUDIT_IGNORED_COLUMNS = new Set([
  'defect_id',
  'flight_id',
  'ajlb_seq_no',
  'blank_rows_after',
  'flight_mins',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
])

/** A defect reported against this flight (#1223), newest first. */
async function getDefectAuditEntriesForFlight(flightId: string): Promise<FlightLogAuditEntry[]> {
  const rows = await db
    .selectFrom('flight.defectAudit as a')
    .leftJoin('member.register as cb', 'cb.memberId', 'a.changedBy')
    .select([
      'a.auditId',
      'a.operationType',
      'a.changedAt',
      'a.changedBy',
      'a.changedData',
      'a.newData',
      'cb.firstName as changedByFirstName',
      'cb.lastName as changedByLastName',
    ])
    .where((eb) =>
      eb.or([
        eb(sql<string | null>`a."changed_data"->>'flight_id'`, '=', flightId),
        eb(sql<string | null>`a."new_data"->>'flight_id'`, '=', flightId),
      ]),
    )
    .orderBy('a.auditId', 'desc')
    .execute()

  return rows.map((row) => ({
    auditId: row.auditId,
    source: 'defect' as const,
    operationType: row.operationType as FlightLogAuditEntry['operationType'],
    changedBy: row.changedBy,
    changedByName: changedByNameOf(row),
    changedAt: row.changedAt.toISOString(),
    changes: diffSnapshots(
      row.changedData as AuditSnapshot,
      row.newData as AuditSnapshot,
      DEFECT_AUDIT_IGNORED_COLUMNS,
      new Set(),
    ),
  }))
}

const REMARK_AUDIT_IGNORED_COLUMNS = new Set([
  'remark_id',
  'flight_id',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
])

/** A remark logged against this flight (#1226), newest first. */
async function getRemarkAuditEntriesForFlight(flightId: string): Promise<FlightLogAuditEntry[]> {
  const rows = await db
    .selectFrom('flight.remarkAudit as a')
    .leftJoin('member.register as cb', 'cb.memberId', 'a.changedBy')
    .select([
      'a.auditId',
      'a.operationType',
      'a.changedAt',
      'a.changedBy',
      'a.changedData',
      'a.newData',
      'cb.firstName as changedByFirstName',
      'cb.lastName as changedByLastName',
    ])
    .where((eb) =>
      eb.or([
        eb(sql<string | null>`a."changed_data"->>'flight_id'`, '=', flightId),
        eb(sql<string | null>`a."new_data"->>'flight_id'`, '=', flightId),
      ]),
    )
    .orderBy('a.auditId', 'desc')
    .execute()

  return rows.map((row) => ({
    auditId: row.auditId,
    source: 'remark' as const,
    operationType: row.operationType as FlightLogAuditEntry['operationType'],
    changedBy: row.changedBy,
    changedByName: changedByNameOf(row),
    changedAt: row.changedAt.toISOString(),
    changes: diffSnapshots(
      row.changedData as AuditSnapshot,
      row.newData as AuditSnapshot,
      REMARK_AUDIT_IGNORED_COLUMNS,
      new Set(),
    ),
  }))
}

/** One snapshot's fuel/oil facts, e.g. "150 l JET A-1" or "0.5 l" for oil. */
const describeLiquidSnapshot = (snapshot: AuditSnapshot): string | null => {
  if (!snapshot) return null
  const quantity = snapshot.quantity_litres
  const detail = snapshot.liquid_type === 'FUEL' ? snapshot.fuel_type : null
  return [quantity != null ? `${String(quantity)} l` : null, detail]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
}

/**
 * The one or two facts about a liquid record worth reporting on *this* flight's
 * history: whether it's linked here at all, and (while it is) its quantity.
 *
 * Deliberately not a generic column diff like the other three sources: most of
 * `liquid.record`'s columns are pricing/tax figures frozen for an expense claim,
 * and a crew member reading someone else's flight's history should not be able to
 * recover those through it any more than they can through the flight's own
 * redacted billing fields (#1019). Curating to quantity + link state avoids that
 * without needing a per-field hidden-fields list here too.
 */
const buildLiquidChanges = (
  before: AuditSnapshot,
  after: AuditSnapshot,
  flightId: string,
  operationType: string,
): FlightLogAuditChange[] => {
  const beforeLinked = before?.flight_log_id === flightId
  // A soft delete never touches flight_log_id, so a linked record that gets
  // deleted would otherwise diff as "still linked, nothing changed" and be
  // dropped by the changes.length===0 check below — silently vanishing from
  // the flight's own history instead of showing up as an unlink.
  const afterLinked = operationType === 'SOFT_DELETE' ? false : after?.flight_log_id === flightId
  const liquidType = (after ?? before)?.liquid_type
  const field = liquidType === 'OIL' ? 'oilRecord' : 'fuelRecord'

  if (beforeLinked !== afterLinked) {
    return [
      {
        field,
        before: beforeLinked ? describeLiquidSnapshot(before) : null,
        after: afterLinked ? describeLiquidSnapshot(after) : null,
      },
    ]
  }

  if (afterLinked && before && after && before.quantity_litres !== after.quantity_litres) {
    return [
      {
        field,
        before: describeLiquidSnapshot(before),
        after: describeLiquidSnapshot(after),
      },
    ]
  }

  return []
}

/**
 * A fuel/oil record linked to, unlinked from, or (while linked) quantity-edited
 * on this flight (#1119), newest first. An UPDATE that touched neither — e.g. the
 * record was later corrected for an expense claim — is left out entirely rather
 * than shown as an empty "Edited" row: unlike the other three sources, most of
 * this table's edits happen for reasons that have nothing to do with the flight.
 */
async function getLiquidAuditEntriesForFlight(flightId: string): Promise<FlightLogAuditEntry[]> {
  const rows = await db
    .selectFrom('liquid.recordAudit as a')
    .leftJoin('member.register as cb', 'cb.memberId', 'a.changedBy')
    .select([
      'a.auditId',
      'a.operationType',
      'a.changedAt',
      'a.changedBy',
      'a.changedData',
      'a.newData',
      'cb.firstName as changedByFirstName',
      'cb.lastName as changedByLastName',
    ])
    .where((eb) =>
      eb.or([
        eb(sql<string | null>`a."changed_data"->>'flight_log_id'`, '=', flightId),
        eb(sql<string | null>`a."new_data"->>'flight_log_id'`, '=', flightId),
      ]),
    )
    .orderBy('a.auditId', 'desc')
    .execute()

  return rows
    .map((row): FlightLogAuditEntry | null => {
      const changes = buildLiquidChanges(
        row.changedData as AuditSnapshot,
        row.newData as AuditSnapshot,
        flightId,
        row.operationType,
      )
      if (changes.length === 0) return null
      return {
        auditId: row.auditId,
        source: 'liquid',
        operationType: row.operationType as FlightLogAuditEntry['operationType'],
        changedBy: row.changedBy,
        changedByName: changedByNameOf(row),
        changedAt: row.changedAt.toISOString(),
        changes,
      }
    })
    .filter((entry): entry is FlightLogAuditEntry => entry !== null)
}

/**
 * Interleaves two already-newest-first-sorted lists by `changedAt`, like the merge
 * step of a mergesort — deliberately never reordering either list's own entries
 * relative to each other, only deciding how the two lists thread together.
 *
 * That restriction is the whole reason to write this instead of one
 * `[...a, ...b].sort(...)`: `flight.logs_audit.changed_at` is a bare `timestamp`
 * (V160, predating the other three tables' `timestamptz`) whose value depends on
 * the timezone of whichever session wrote it — Flyway's seed data is Helsinki-local,
 * the app is UTC, three hours apart on the same clock reading. A flat sort by
 * `changedAt` across sources lets one bad old flight.logs_audit row jump ahead of a
 * genuinely newer one from the *same* table, which briefly shipped as a real
 * regression here. Merging instead means `a`'s own already-correct order (by
 * `audit_id`, see getFlightLogsAuditEntries) survives untouched; only *where* a `b`
 * entry threads in among skewed old `a` timestamps can still be slightly off, which
 * is a display-order nicety for historical rows, not a correctness bug.
 */
const mergeByChangedAt = (
  a: readonly FlightLogAuditEntry[],
  b: readonly FlightLogAuditEntry[],
): FlightLogAuditEntry[] => {
  const merged: FlightLogAuditEntry[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    merged.push(
      new Date(a[i]!.changedAt).getTime() >= new Date(b[j]!.changedAt).getTime()
        ? a[i++]!
        : b[j++]!,
    )
  }
  return [...merged, ...a.slice(i), ...b.slice(j)]
}

/**
 * A flight log's complete change history, newest first: its own field-level
 * trail plus every related entity that can be attached to it and carries its
 * own audit trail (a defect, a remark, a fuel/oil record). Merged into one
 * timeline by time rather than shown as four separate lists, so "what happened
 * to this flight" reads as a single narrative.
 */
export async function getFlightLogAuditTrail(
  flightId: string,
  hiddenFields: readonly string[] = [],
): Promise<FlightLogAuditEntry[]> {
  const hidden = new Set(hiddenFields)

  const [flightEntries, defectEntries, remarkEntries, liquidEntries] = await Promise.all([
    getFlightLogsAuditEntries(flightId, hidden),
    getDefectAuditEntriesForFlight(flightId),
    getRemarkAuditEntriesForFlight(flightId),
    getLiquidAuditEntriesForFlight(flightId),
  ])

  // The other three sources' timestamps are all reliable timestamptz columns, so
  // it's safe to combine and sort them freely before merging that combined list
  // against flightEntries -- only flightEntries' own relative order needs the
  // careful treatment mergeByChangedAt exists for.
  const relatedEntries = [...defectEntries, ...remarkEntries, ...liquidEntries].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  )

  return mergeByChangedAt(flightEntries, relatedEntries)
}

export async function getUnbilledFlightsForEstimation(
  memberId: string,
): Promise<FlightForEstimation[]> {
  const rows = await db
    .selectFrom('flight.logs')
    .leftJoin('member.register', 'flight.logs.billableMemberId', 'member.register.memberId')
    .leftJoin('flight.flightCredits', 'flight.logs.flightId', 'flight.flightCredits.flightId')
    .select([
      'flight.logs.flightId',
      'flight.logs.flightType',
      'flight.logs.isBillableFlight',
      'flight.logs.isBilled',
      'flight.logs.blockMins',
      'flight.logs.flightMins',
      'flight.logs.departureAirport',
      'flight.logs.arrivalAirport',
      'flight.logs.minBillableExceptionApprovedByMemberId',
      'flight.logs.aircraftRegistration',
      'flight.logs.takeoffTimeUtc',
      'member.register.isTrainingProgramPilot',
      'flight.flightCredits.creditedMins',
    ])
    .where('flight.logs.billableMemberId', '=', memberId)
    .where('flight.logs.isBillableFlight', '=', true)
    .where('flight.logs.isBilled', '=', false)
    .execute()

  return rows.map((row) => ({
    flightId: row.flightId,
    flightType: row.flightType,
    isBillableFlight: row.isBillableFlight,
    isBilled: row.isBilled,
    isTrainingProgramPilot: row.isTrainingProgramPilot ?? null,
    blockMins: row.blockMins,
    flightMins: row.flightMins,
    departureAirport: row.departureAirport,
    arrivalAirport: row.arrivalAirport,
    minBillableExceptionApprovedByMemberId: row.minBillableExceptionApprovedByMemberId ?? null,
    creditedMins: row.creditedMins ?? null,
    aircraftRegistration: row.aircraftRegistration,
    takeoffTimeUtc: row.takeoffTimeUtc.toISOString(),
  }))
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

/**
 * A member's recency and totals per aircraft, for the dashboard currency widget.
 *
 * Scoped to the flights in the member's own logbook, not the flights billed to them:
 * an instructor's time with a student counts towards their landings and hours like any
 * other flying, and a student billed for a flight they flew as STU still flew it
 * (#1019 Q2 — always included, not behind the list's toggle).
 */
export async function getFlightStats(
  memberId: string,
  activeOnly: boolean,
): Promise<FlightLogStats[]> {
  const res = await db
    .selectFrom('flight.logs')
    .select((eb) => [
      'flight.logs.aircraftRegistration as aircraftRegistration',
      eb.fn.max<Date>('flight.logs.takeoffTimeUtc').as('lastTakeoffTimeUtc'),
      // The latest flight of the group, as an aggregate rather than the correlated
      // subquery this replaces: the subquery had to repeat the outer WHERE to stay in
      // step with it, and would have silently drifted the moment the two spellings of
      // "the member's flights" diverged. Raw SQL, so the column names are the
      // database's own snake_case -- only the result key is camelCased (DATA_LAYER.md).
      sql<string>`(array_agg("flight"."logs"."flight_id" ORDER BY "flight"."logs"."takeoff_time_utc" DESC))[1]`.as(
        'lastFlightId',
      ),
      eb.cast<number>(eb.fn.count<number>('flight.logs.flightId'), 'integer').as('totalFlights'),
      eb.cast<number>(eb.fn.sum('flight.logs.flightMins'), 'integer').as('totalFlightMins'),
      eb.cast<number>(eb.fn.sum('flight.logs.numberOfLandings'), 'integer').as('totalLandings'),

      sumIfMonths(eb, 1, 'flight.logs.flightMins').as('time1month'),
      sumIfMonths(eb, 3, 'flight.logs.flightMins').as('time3month'),
      sumIfMonths(eb, 6, 'flight.logs.flightMins').as('time6month'),
      sumIfMonths(eb, 12, 'flight.logs.flightMins').as('time12month'),

      sumIfMonths(eb, 1, 'flight.logs.numberOfLandings').as('landings1month'),
      sumIfMonths(eb, 3, 'flight.logs.numberOfLandings').as('landings3month'),
      sumIfMonths(eb, 6, 'flight.logs.numberOfLandings').as('landings6month'),
      sumIfMonths(eb, 12, 'flight.logs.numberOfLandings').as('landings12month'),
    ])
    .where((eb) => onBoard(eb, memberId))
    .$if(activeOnly === true, (qb) =>
      qb.where((eb) =>
        eb(
          'flight.logs.aircraftRegistration',
          'in',
          eb
            .selectFrom('flight.aircraft')
            .select('flight.aircraft.registration')
            .where('active', '=', true),
        ),
      ),
    )
    // Grouped by aircraft alone. billableMemberId used to be in here too, which was a
    // no-op while the WHERE pinned it to one value -- now that a group can mix the
    // member's own flights with ones billed to a student, keeping it would split each
    // aircraft into one row per payer.
    .groupBy('flight.logs.aircraftRegistration')
    .orderBy('lastTakeoffTimeUtc', 'desc')
    .execute()

  return res.map((row) => ({
    ...row,
    lastTakeoffTimeUtc: row.lastTakeoffTimeUtc.toISOString(),
  }))
}

export async function getInvoicableFlights(
  filters: InvoicableFlightFilters,
): Promise<InvoicableFlightListResponse> {
  let query = db
    .selectFrom('flight.logs')
    .leftJoin('member.register', 'flight.logs.billableMemberId', 'member.register.memberId')
    .leftJoin('flight.flightCredits', 'flight.logs.flightId', 'flight.flightCredits.flightId')
    .where('status', '=', FlightLogStatus.VALIDATED)
    .$if(!!filters.aircraftRegistration, (qb) =>
      qb.where('aircraftRegistration', '=', filters.aircraftRegistration),
    )
    .where('onBlockTimeEpoch', '<=', toHelsinki(filters.endDate).endOf('day').unix().toString())

  if (filters.flights === InvoicableFlights.FERRY) {
    query = query.where('flightType', '=', FlightType.FERRY)
  } else if (filters.flights === InvoicableFlights.TEST_FLIGHT) {
    query = query.where('flightType', '=', FlightType.TEST_FLIGHT)
  } else if (filters.flights === InvoicableFlights.COMMENT) {
    query = query.where('billingRemarks', 'is not', null)
    query = query.where('flight.logs.entryErrorFee', '=', false)
    query = query.where('flightType', 'not in', [FlightType.FERRY, FlightType.TEST_FLIGHT])
  } else if (filters.flights === InvoicableFlights.ENTRY_ERROR) {
    query = query.where('flight.logs.entryErrorFee', '=', true)
  } else if (filters.flights === InvoicableFlights.PARTIALLY_BILLABLE) {
    query = query.where('flight.logs.partiallyBillableFlight', '=', true)
  } else if (filters.flights === InvoicableFlights.MIN_BILLABLE) {
    const minMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20
    query = query.where((eb) =>
      eb(
        eb
          .case()
          .when('member.register.isTrainingProgramPilot', '=', true)
          .then(eb.ref('flight.logs.blockMins'))
          .else(eb.ref('flight.logs.flightMins'))
          .end(),
        '<',
        minMins,
      ),
    )
    // min billable rule applied to local flights only (departure and arrival airports the same)
    query = query.whereRef('flight.logs.departureAirport', '=', 'flight.logs.arrivalAirport')
  } else if (filters.flights === InvoicableFlights.OTHER) {
    const minMins = Number(process.env.MIN_BILLABLE_FLIGHT_MINS) || 20
    query = query
      .where('billingRemarks', 'is', null)
      .where('flight.logs.partiallyBillableFlight', 'is not', true)
      .where('flight.logs.entryErrorFee', '=', false)
      .where('flightType', 'not in', [FlightType.FERRY, FlightType.TEST_FLIGHT])
      .where((eb) =>
        eb.or([
          // Cross-country flights (any duration) - departure != arrival
          eb('flight.logs.departureAirport', '!=', eb.ref('flight.logs.arrivalAirport')),
          // Local flights >= min billable time - departure == arrival AND >= minMins
          eb.and([
            eb('flight.logs.departureAirport', '=', eb.ref('flight.logs.arrivalAirport')),
            eb(
              eb
                .case()
                .when('member.register.isTrainingProgramPilot', '=', true)
                .then(eb.ref('flight.logs.blockMins'))
                .else(eb.ref('flight.logs.flightMins'))
                .end(),
              '>=',
              minMins,
            ),
          ]),
        ]),
      )
  }

  const { rows } = await query
    .select((eb) => eb.fn.countAll<number>().as('rows'))
    .executeTakeFirstOrThrow()

  const pageSize = filters.limit ?? 50
  // get the total number of pages
  const pages = Math.max(1, Math.ceil(rows / pageSize))
  // if page is not defined, use the last page
  const page = filters.page ?? pages ?? 1

  const results = await query
    .select([
      'flight.logs.aircraftRegistration',
      'flight.logs.arrivalAirport',
      'flight.logs.billableMemberId',
      'flight.logs.billingRemarks',
      'flight.logs.departureAirport',
      'flight.logs.flightId',
      'flight.logs.flightTime',
      'flight.logs.flightType',
      'flight.logs.fuelUpliftLitres',
      'flight.logs.isBillableFlight',
      'flight.logs.nonBillingReason',
      'flight.logs.flightMins',
      'flight.logs.blockMins',
      'flight.logs.blockTime',
      'flight.logs.numberOfLandings',
      'flight.logs.takeoffTimeUtc',
      'flight.logs.landingTimeUtc',
      'flight.logs.personsOnBoard',
      'flight.logs.picLastName',
      'flight.logs.status',
      'flight.logs.partiallyBillableFlight',
      'flight.logs.entryErrorFee',
      'member.register.lastName as billableMemberLastName',
      'member.register.isTrainingProgramPilot',
      'member.register.billingId',
      'flight.flightCredits.creditedMins',
      'flight.flightCredits.note',
      'flight.logs.validationRemarks',
      'flight.logs.minBillableExceptionReason',
      'flight.logs.minBillableExceptionApprovedByMemberId',
    ])
    .orderBy('offBlockTimeEpoch', 'asc')
    .offset(pageSize * (page - 1))
    .limit(pageSize)
    .execute()

  return {
    logs: results.map((row) => {
      const res: InvoicableFlight = {
        aircraftRegistration: row.aircraftRegistration,
        arrivalAirport: row.arrivalAirport,
        billableMemberId: row.billableMemberId,
        billableMemberLastName: row.billableMemberLastName,
        billingId: row.billingId,
        isTrainingProgramPilot: row.isTrainingProgramPilot,
        billingRemarks: row.billingRemarks,
        departureAirport: row.departureAirport,
        flightId: row.flightId,
        flightTime: row.flightTime,
        flightMins: row.flightMins,
        blockMins: row.blockMins,
        blockTime: row.blockTime,
        flightType: row.flightType as FlightType,
        fuelUpliftLitres: row.fuelUpliftLitres,
        isBillableFlight: row.isBillableFlight,
        nonBillingReason: row.nonBillingReason,
        numberOfLandings: row.numberOfLandings,
        takeoffTimeUtc: row.takeoffTimeUtc.toISOString(),
        landingTimeUtc: row.landingTimeUtc.toISOString(),
        personsOnBoard: row.personsOnBoard,
        picLastName: row.picLastName,
        status: row.status as FlightLogStatus,
        partiallyBillableFlight: row.partiallyBillableFlight ?? false,
        entryErrorFee: row.entryErrorFee ?? false,
        creditedMins: row.creditedMins ?? null,
        creditedNote: row.note ?? null,
        validationRemarks: row.validationRemarks ?? null,
        minBillableExceptionReason: row.minBillableExceptionReason ?? null,
        minBillableExceptionApprovedByMemberId: row.minBillableExceptionApprovedByMemberId ?? null,
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
  data: FlightLogMemberRequest | FlightLogUpsertRequest,
  user: { memberId: string; permissions: MIKPermissions[] },
): Promise<string> {
  // admins can bill flights to other members
  const billableMemberId = 'billableMemberId' in data ? data.billableMemberId : user.memberId

  // determine if this is a DTO training flight (auto-detected from member's training status)
  const member = await db
    .selectFrom('member.register')
    .select('isTrainingProgramPilot')
    .where('memberId', '=', billableMemberId)
    .limit(1)
    .executeTakeFirstOrThrow()
  const isDtoTrainingFlight = !!member.isTrainingProgramPilot

  // DTO training flights always have flight type DTO
  const flightType = isDtoTrainingFlight ? FlightType.DTO : data.flightType

  const retval = await db
    .insertInto('flight.logs')
    .values((eb) => ({
      aircraftRegistration: data.aircraftRegistration,
      arrivalAirport: data.arrivalAirport,
      billableMemberId: billableMemberId,
      billingRemarks: data.billingRemarks,
      picLastName: eb
        .selectFrom('member.register')
        .select('lastName')
        .where('memberId', '=', data.picMemberId),
      picMemberId: data.picMemberId,
      picRole: data.picRole,
      crew2LastName: eb
        .selectFrom('member.register')
        .select('lastName')
        .where('memberId', '=', data.crew2MemberId),
      crew2MemberId: data.crew2MemberId,
      crew2Role: data.crew2Role,
      crew3LastName: eb
        .selectFrom('member.register')
        .select('lastName')
        .where('memberId', '=', data.crew3MemberId),
      crew3MemberId: data.crew3MemberId,
      crew3Role: data.crew3Role,
      crew4LastName: eb
        .selectFrom('member.register')
        .select('lastName')
        .where('memberId', '=', data.crew4MemberId),
      crew4MemberId: data.crew4MemberId,
      crew4Role: data.crew4Role,
      departureAirport: data.departureAirport,
      flightType: flightType,
      fuelRemainingLitres: data.fuelRemainingLitres,
      fuelUpliftLitres: data.fuelUpliftLitres,
      incidentOrObservations: data.incidentOrObservations,
      instrumentFlyingMins: data.instrumentFlyingMins,
      nightFlyingMins: data.nightFlyingMins,
      numberOfLandings: data.numberOfLandings,
      numberOfNightLandings: data.numberOfNightLandings,
      oilUpliftLitres: data.oilUpliftLitres,
      offBlockTimeEpoch: data.offBlockTimeEpoch,
      takeoffTimeEpoch: data.takeoffTimeEpoch,
      landingTimeEpoch: data.landingTimeEpoch,
      onBlockTimeEpoch: data.onBlockTimeEpoch,
      personalRemarks: data.personalRemarks,
      personsOnBoard: data.personsOnBoard,
      privOrComFlight: flightTypeToPrivOrCom(flightType),
      totalTimeInService: data.totalTimeInService,

      // Admin billability/fee/validation fields (use request values when available)
      invoiceNumber: undefined,
      isBillableFlight: 'isBillableFlight' in data ? data.isBillableFlight : true,
      partiallyBillableFlight: data.partiallyBillableFlight ?? false,
      entryErrorFee: 'entryErrorFee' in data ? (data.entryErrorFee ?? false) : false,
      entryErrorFeeAppliedByMemberId:
        'entryErrorFee' in data && data.entryErrorFee ? user.memberId : null,
      nonBillingApprovedByMemberId:
        'isBillableFlight' in data && data.isBillableFlight === false ? user.memberId : null,
      nonBillingReason: 'nonBillingReason' in data ? data.nonBillingReason : undefined,
      minBillableExceptionReason:
        'minBillableExceptionReason' in data ? data.minBillableExceptionReason : undefined,
      minBillableExceptionApprovedByMemberId:
        'minBillableExceptionReason' in data && data.minBillableExceptionReason !== null
          ? user.memberId
          : null,
      validationRemarks: 'validationRemarks' in data ? data.validationRemarks : null,

      ajlbBlankRowsBefore: 'ajlbBlankRowsBefore' in data ? data.ajlbBlankRowsBefore : 0,
      ajlbSeqNo: eb
        .selectFrom('flight.vwFlightTimeTotals')
        .select(eb.fn.coalesce('ajlbSeqNo', eb.lit(0)).as('ajlbSeqNo'))
        .where('aircraftRegistration', '=', data.aircraftRegistration)
        .where('current', '=', true),
      flightId: generateShortId(),
      createdBy: user.memberId,
      createdAt: new Date().toISOString(),
      updatedBy: user.memberId,
      updatedAt: new Date().toISOString(),
      isDtoTrainingFlight: isDtoTrainingFlight,
    }))
    .returning('flightId')
    .executeTakeFirstOrThrow()

  return retval.flightId
}

export async function deleteFlightLog(flightId: string, actor: string): Promise<boolean> {
  return db.transaction().execute(async (txn) => {
    // liquid.record.flight_log_id has no ON DELETE handling: a fuelling
    // outlives the flight it was reported against ("a member may fuel an
    // aircraft even when the planned flight is cancelled", #1119), so deleting
    // the flight log must unlink any record pointing at it rather than leave
    // the delete to fail on the FK.
    await txn
      .updateTable('liquid.record')
      .set({ flightLogId: null, ...auditUpdate(actor) })
      .where('flightLogId', '=', flightId)
      .execute()

    const retval = await txn
      .deleteFrom('flight.logs')
      .where('flightId', '=', flightId)
      .where('status', '=', FlightLogStatus.NEW)
      .executeTakeFirst()

    return retval.numDeletedRows == 1n
  })
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
  flightId: string,
  data: Partial<FlightLogUpsertRequest>,
  user: JWTUser,
): Promise<boolean> =>
  updateFlightLogWithAudit(flightId, user, (eb) => ({
    aircraftRegistration: data.aircraftRegistration,
    arrivalAirport: data.arrivalAirport,
    billableMemberId: data.billableMemberId,
    billingRemarks: data.billingRemarks,
    picLastName: data.picMemberId
      ? eb.selectFrom('member.register').select('lastName').where('memberId', '=', data.picMemberId)
      : undefined,
    picMemberId: data.picMemberId,
    picRole: data.picRole,
    crew2LastName:
      data.crew2MemberId === undefined
        ? undefined
        : data.crew2MemberId
          ? eb
              .selectFrom('member.register')
              .select('lastName')
              .where('memberId', '=', data.crew2MemberId)
          : null,
    crew2MemberId: data.crew2MemberId,
    crew2Role: data.crew2Role,
    crew3LastName:
      data.crew3MemberId === undefined
        ? undefined
        : data.crew3MemberId
          ? eb
              .selectFrom('member.register')
              .select('lastName')
              .where('memberId', '=', data.crew3MemberId)
          : null,
    crew3MemberId: data.crew3MemberId,
    crew3Role: data.crew3Role,
    crew4LastName:
      data.crew4MemberId === undefined
        ? undefined
        : data.crew4MemberId
          ? eb
              .selectFrom('member.register')
              .select('lastName')
              .where('memberId', '=', data.crew4MemberId)
          : null,
    crew4MemberId: data.crew4MemberId,
    crew4Role: data.crew4Role,
    departureAirport: data.departureAirport,
    flightType: data.flightType,
    fuelRemainingLitres: data.fuelRemainingLitres,
    fuelUpliftLitres: data.fuelUpliftLitres,
    incidentOrObservations: data.incidentOrObservations,
    instrumentFlyingMins: data.instrumentFlyingMins,
    nightFlyingMins: data.nightFlyingMins,
    numberOfLandings: data.numberOfLandings,
    numberOfNightLandings: data.numberOfNightLandings,
    oilUpliftLitres: data.oilUpliftLitres,
    offBlockTimeEpoch: data.offBlockTimeEpoch,
    takeoffTimeEpoch: data.takeoffTimeEpoch,
    landingTimeEpoch: data.landingTimeEpoch,
    onBlockTimeEpoch: data.onBlockTimeEpoch,
    personalRemarks: data.personalRemarks,
    personsOnBoard: data.personsOnBoard,
    privOrComFlight: data.flightType ? flightTypeToPrivOrCom(data.flightType) : undefined,
    totalTimeInService: data.totalTimeInService,

    // admin fields are editable
    ajlbBlankRowsBefore: data.ajlbBlankRowsBefore,
    ajlbSeqNo: data.ajlbSeqNo,
    isBillableFlight: data.isBillableFlight,
    partiallyBillableFlight: data.partiallyBillableFlight ?? false,
    entryErrorFee: data.entryErrorFee ?? undefined,
    entryErrorFeeAppliedByMemberId:
      data.entryErrorFee === undefined ? undefined : data.entryErrorFee ? user.memberId : null,
    nonBillingApprovedByMemberId:
      data.isBillableFlight === undefined
        ? undefined
        : data.isBillableFlight === false
          ? user.memberId
          : null,
    nonBillingReason: data.nonBillingReason,
    minBillableExceptionReason: data.minBillableExceptionReason,
    minBillableExceptionApprovedByMemberId:
      data.minBillableExceptionReason === undefined
        ? undefined
        : data.minBillableExceptionReason !== null
          ? user.memberId
          : null,
    validationRemarks: data.validationRemarks,

    isDtoTrainingFlight: data.billableMemberId
      ? eb
          .selectFrom('member.register')
          .select('isTrainingProgramPilot')
          .where('memberId', '=', data.billableMemberId)
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
        ajlbTotalFlightMins: null,
        ajlbPageNumber: null,
        ajlbRowNumber: null,
        ajlbTotalLandings: null,
      }))
    case FlightLogStatus.VALIDATED:
      // copy values from the view
      return updateFlightLogWithAudit(flightId, user, (eb) => ({
        status: newStatus,
        ...(oldStatus == FlightLogStatus.NEW
          ? {
              ajlbTotalFlightMins: eb
                .selectFrom('flight.vwFlightLogs')
                .select('acTotalFlightMins')
                .where('flightId', '=', flightId),
              ajlbPageNumber: eb
                .selectFrom('flight.vwFlightLogs')
                .select('pageNumber')
                .where('flightId', '=', flightId),
              ajlbRowNumber: eb
                .selectFrom('flight.vwFlightLogs')
                .select('rowNumber')
                .where('flightId', '=', flightId),
              ajlbTotalLandings: eb
                .selectFrom('flight.vwFlightLogs')
                .select('acTotalLandings')
                .where('flightId', '=', flightId),
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
  await db.transaction().execute(async (trx) => {
    const now = new Date()
    // Mark flights as invoiced so they are not selected again by getInvoicableFlights
    for (const flight of flights) {
      // Assuming InvoicableFlight contains the flight's identifier as `flightId`
      await trx
        .updateTable('flight.logs')
        .set({
          status: FlightLogStatus.QUEUED_FOR_INVOICING,
          ...auditUpdate(MIK_SIMPLBOOKS_MEMBER, now),
        })
        .where('flightId', '=', flight.flightId)
        .execute()
    }
    // Enqueue the outbox message with the original flights payload
    await trx
      .insertInto('accts.outboxSimplbooks')
      .values({
        id: randomUUID(),
        eventType: SimplbooksEventType.FLIGHT_INVOICE,
        payload: structuredClone({ flights }),
      })
      .execute()
  })
}

const updateFlightLogWithAudit = async (
  flightId: string,
  user: JWTUser,
  update: (eb: ExpressionBuilder<DB, 'flight.logs'>) => UpdateObject<DB, 'flight.logs'>,
): Promise<boolean> => {
  let updQuery = db
    .updateTable('flight.logs')
    .set(update)
    .set({
      updatedBy: user.memberId,
      updatedAt: new Date(),
    })
    .where('flightId', '=', flightId)

  const retval = await updQuery.executeTakeFirst()
  return retval.numUpdatedRows == 1n
}

/**
 * Existing flight logs for the same aircraft whose block time overlaps the given
 * interval. Uses the same half-open comparison as the flight.no_overlaps_function
 * trigger, so anything returned here is what the database will reject on save.
 */
export async function getOverlappingFlightLogs({
  aircraftRegistration,
  offBlockTimeEpoch,
  onBlockTimeEpoch,
  excludeFlightId,
}: FlightLogOverlapQuery): Promise<FlightLogOverlapConflict[]> {
  const rows = await db
    .selectFrom('flight.logs')
    .select(['flightId', 'aircraftRegistration', 'offBlockTimeUtc', 'onBlockTimeUtc', 'status'])
    .where('aircraftRegistration', '=', aircraftRegistration)
    // epoch columns are int8, which kysely surfaces as string
    .where('offBlockTimeEpoch', '<', onBlockTimeEpoch.toString())
    .where('onBlockTimeEpoch', '>', offBlockTimeEpoch.toString())
    .$if(!!excludeFlightId, (qb) => qb.where('flightId', '!=', excludeFlightId!))
    .orderBy('offBlockTimeEpoch')
    .execute()

  return rows.map((row) => ({
    flightId: row.flightId,
    aircraftRegistration: row.aircraftRegistration,
    offBlockTimeUtc: row.offBlockTimeUtc.toISOString(),
    onBlockTimeUtc: row.onBlockTimeUtc.toISOString(),
    status: row.status as FlightLogStatus,
  }))
}

export async function getFlightLogTotals(registration?: string): Promise<FlightTimeTotals[]> {
  let query = db
    .selectFrom('flight.vwFlightTimeTotals')
    .selectAll()
    .where('current', '=', true)
    .orderBy('aircraftRegistration')

  if (registration) {
    query = query.where('aircraftRegistration', '=', registration)
  }
  const results = await query.execute()
  return results.map((row) => ({
    // there are no nullable values in the view, it is safe to use ! operator
    acTotalFlightTime: row.unverifiedTotalFlightTime!,
    acTotalFlightMins: row.unverifiedTotalFlightMins!,
    acTotalLandings: row.totalLandings ?? null,
    aircraftRegistration: row.aircraftRegistration!,
    ajlbSeqNo: row.ajlbSeqNo!,
  }))
}

export async function getFlightCredit(flightId: string): Promise<FlightCredit | null> {
  const row = await db
    .selectFrom('flight.flightCredits')
    .select(['flightId', 'creditedMins', 'note'])
    .where('flightId', '=', flightId)
    .executeTakeFirst()

  if (!row) return null

  return {
    flightId: row.flightId,
    creditedMins: row.creditedMins,
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
    .insertInto('flight.flightCredits')
    .values({
      flightId: flightId,
      creditedMins: creditedMins,
      note,
      allocatedByMemberId: allocatedByMemberId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.column('flightId').doUpdateSet({
        creditedMins: creditedMins,
        note,
        allocatedByMemberId: allocatedByMemberId,
        updatedAt: now,
      }),
    )
    .execute()

  return { flightId, creditedMins, note }
}

interface ExportCrewSlot {
  memberId: string | null
  lastName: string | null
  role: string | null
}

/**
 * The `pic_*` columns are just crew slot 1 — its occupant may hold any role
 * (PIC, FI, STU, FE, OBS), so slot 1 is not necessarily the exporting pilot nor
 * the legal pilot in command. Resolve, for a single flight row:
 *  - `ownRole`: the role held by the member this export is generated for, in
 *    whichever crew slot they occupied. Falls back to slot 1 for exports that are
 *    not scoped to a member (admins exporting everyone's flights).
 *  - `actingPicLastName`: the name of the crew member who acted as pilot in
 *    command — the crew member with the PIC role if there is one, otherwise the
 *    instructor (who is PIC on a training flight), otherwise slot 1.
 */
function resolveExportCrew(
  slots: ExportCrewSlot[],
  memberId?: string,
): { ownRole: string | null; actingPicLastName: string } {
  const own = memberId ? slots.find((slot) => slot.memberId === memberId) : slots[0]
  const actingPic =
    slots.find((slot) => slot.role === 'PIC') ??
    slots.find((slot) => slot.role === 'FI') ??
    slots.find((slot) => slot.role === 'FE') ??
    slots[0]
  return {
    ownRole: own?.role ?? null,
    actingPicLastName: actingPic.lastName ?? slots[0].lastName ?? '',
  }
}

function buildExportBaseQuery(filters: FlightLogExportFilters, memberId?: string) {
  return (
    db
      .selectFrom('flight.logs')
      .leftJoin(
        'flight.aircraft',
        'flight.logs.aircraftRegistration',
        'flight.aircraft.registration',
      )
      // A pilot log must contain the flights the member actually flew, in whichever
      // crew slot they occupied — not the flights they happened to be billed for. The
      // role filter inside onBoardAsCrew also keeps flights the member was merely
      // carried on (OBS) out of the EASA totals, where they would otherwise have added
      // their whole block time to the "total time" column with no role time to match
      // (#1019 Q6).
      .$if(!!memberId, (qb) => qb.where((eb) => onBoardAsCrew(eb, memberId!)))
      .$if(!!filters.aircraftRegistration, (qb) =>
        qb.where('aircraftRegistration', '=', filters.aircraftRegistration!),
      )
      .$if(!!filters.startDate, (qb) =>
        qb.where('offBlockTimeEpoch', '>=', dayjs(filters.startDate!).unix().toString()),
      )
      .$if(!!filters.endDate, (qb) =>
        qb.where('onBlockTimeEpoch', '<=', dayjs(filters.endDate!).endOf('day').unix().toString()),
      )
  )
}

export async function countFlightLogsForExport(
  filters: FlightLogExportFilters,
  memberId?: string,
): Promise<number> {
  const { count } = await buildExportBaseQuery(filters, memberId)
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()
  return Number(count)
}

export async function getFlightLogsForExport(
  filters: FlightLogExportFilters,
  memberId?: string,
): Promise<FlightLogExportEntry[]> {
  const results = await buildExportBaseQuery(filters, memberId)
    .select([
      'flight.logs.aircraftRegistration',
      'flight.logs.ajlbBlankRowsBefore',
      'flight.logs.ajlbSeqNo',
      'flight.logs.arrivalAirport',
      'flight.logs.billableMemberId',
      'flight.logs.blockMins',
      'flight.logs.blockTime',
      'flight.logs.crew2LastName',
      'flight.logs.crew2MemberId',
      'flight.logs.crew2Role',
      'flight.logs.crew3LastName',
      'flight.logs.crew3MemberId',
      'flight.logs.crew3Role',
      'flight.logs.crew4LastName',
      'flight.logs.crew4MemberId',
      'flight.logs.crew4Role',
      'flight.logs.departureAirport',
      'flight.logs.flightId',
      'flight.logs.flightMins',
      'flight.logs.flightTime',
      'flight.logs.flightType',
      'flight.logs.fuelRemainingLitres',
      'flight.logs.fuelUpliftLitres',
      'flight.logs.incidentOrObservations',
      'flight.logs.instrumentFlyingMins',
      'flight.logs.invoiceNumber',
      'flight.logs.isBillableFlight',
      'flight.logs.isBilled',
      'flight.logs.minBillableExceptionApprovedByMemberId',
      'flight.logs.nightFlyingMins',
      'flight.logs.numberOfLandings',
      'flight.logs.numberOfNightLandings',
      'flight.logs.oilUpliftLitres',
      'flight.logs.offBlockTimeUtc',
      'flight.logs.onBlockTimeUtc',
      'flight.logs.takeoffTimeUtc',
      'flight.logs.landingTimeUtc',
      'flight.logs.personalRemarks',
      'flight.logs.personsOnBoard',
      'flight.logs.picLastName',
      'flight.logs.picMemberId',
      'flight.logs.picRole',
      'flight.logs.status',
      'flight.logs.totalTimeInService',
      'flight.aircraft.model as aircraftModel',
    ])
    .orderBy('offBlockTimeEpoch', 'asc')
    .execute()

  return results.map((row) => {
    const { ownRole, actingPicLastName } = resolveExportCrew(
      [
        { memberId: row.picMemberId, lastName: row.picLastName, role: row.picRole },
        { memberId: row.crew2MemberId, lastName: row.crew2LastName, role: row.crew2Role },
        { memberId: row.crew3MemberId, lastName: row.crew3LastName, role: row.crew3Role },
        { memberId: row.crew4MemberId, lastName: row.crew4LastName, role: row.crew4Role },
      ],
      memberId,
    )
    const listEntry: FlightLogListEntry = {
      acTotalFlightTime: '00:00',
      acTotalLandings: null,
      aircraftRegistration: row.aircraftRegistration,
      ajlbBlankRowsBefore: row.ajlbBlankRowsBefore,
      ajlbSeqNo: row.ajlbSeqNo,
      ajlbRowNo: 0,
      arrivalAirport: row.arrivalAirport,
      billableMemberId: row.billableMemberId,
      blockMins: row.blockMins,
      blockTime: row.blockTime,
      crew2LastName: row.crew2LastName,
      creditedMins: null,
      departureAirport: row.departureAirport,
      estimatedCost: null,
      flightId: row.flightId,
      flightMins: row.flightMins,
      flightTime: row.flightTime,
      flightType: row.flightType as FlightType,
      fuelRemainingLitres: row.fuelRemainingLitres,
      fuelUpliftLitres: row.fuelUpliftLitres,
      incidentOrObservations: row.incidentOrObservations,
      instrumentFlyingMins: row.instrumentFlyingMins,
      invoiceNumber: row.invoiceNumber,
      isBillableFlight: row.isBillableFlight,
      isBilled: row.isBilled,
      isTrainingProgramPilot: null,
      minBillableExceptionReason: null,
      minBillableExceptionApprovedByMemberId: row.minBillableExceptionApprovedByMemberId ?? null,
      nightFlyingMins: row.nightFlyingMins,
      numberOfLandings: row.numberOfLandings,
      numberOfNightLandings: row.numberOfNightLandings,
      oilUpliftLitres: row.oilUpliftLitres,
      offBlockTimeUtc: row.offBlockTimeUtc.toISOString(),
      takeoffTimeUtc: row.takeoffTimeUtc.toISOString(),
      landingTimeUtc: row.landingTimeUtc.toISOString(),
      onBlockTimeUtc: row.onBlockTimeUtc.toISOString(),
      personsOnBoard: row.personsOnBoard,
      picLastName: row.picLastName,
      status: row.status as FlightLogStatus,
      totalTimeInService: row.totalTimeInService,
      acTotalFlightMins: null,
      myCrewRole: myCrewRoleOf(row, memberId),
      isOwnFlight: !!memberId && row.billableMemberId === memberId,
    }
    return {
      ...listEntry,
      flightMins: row.flightMins,
      picRole: row.picRole,
      ownRole,
      actingPicLastName,
      aircraftModel: row.aircraftModel ?? null,
      personalRemarks: row.personalRemarks,
    }
  })
}
