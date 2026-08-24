import { BookingStatus, type BookingType, type CancellationReason } from '@mik/contracts/bookings'
import {
  HEAD_GAP_THRESHOLD_MINS,
  TAIL_GAP_THRESHOLD_MINS,
  type MemberEfficiencyEntry,
  type MemberEfficiencyResponse,
  type MemberEfficiencySummary,
} from '@mik/contracts/member-efficiency'
import dayjs from 'dayjs'
import { sql } from 'kysely'

import { db } from './connection.ts'

/**
 * Per-member reservation efficiency (issue #1174).
 *
 * There is no foreign key between `schedule.bookings` and `flight.logs`, so a booking is
 * tied to the flights that were made under it by overlap on the same aircraft: any log
 * whose off-block/on-block interval intersects the reservation window on that
 * registration was flown out of that reservation. `schedule.no_overlap_trigger` keeps
 * two *confirmed* bookings off the same aircraft at the same time, so in practice a
 * flight has one home; where a tentative booking overlaps a confirmed one the flight is
 * shown against both, and the member's totals de-duplicate it by `flightId`.
 *
 * Cancelled bookings never take a flight, even when one happened in their window — the
 * aircraft was released, and whatever was flown belongs to whoever booked it after.
 *
 * Only reservations that have already run their course are measured. Both callers ask
 * for a window ending at the end of *today*, so without that a confirmed booking later
 * this afternoon — or one airborne right now — would arrive with no flights against it
 * and be reported as a no-show before it had had the chance to happen. A cancellation is
 * the exception: it is complete the moment it is made, so a cancelled booking counts
 * whether or not its slot has come round yet.
 */

/** One booking row, repeated once per flight log matched to it (none → a single null row). */
export interface MemberEfficiencyJoinRow {
  bookingId: string
  registration: string
  bookingStatus: string
  bookingType: string
  startTimeEpoch: string | number
  endTimeEpoch: string | number
  startTimeUtc: Date
  endTimeUtc: Date
  cancellationReason: string | null
  cancellationNote: string | null
  cancelledAt: Date | null
  flightId: string | null
  offBlockTimeEpoch: string | number | null
  onBlockTimeEpoch: string | number | null
  flightMins: number | null
}

/** Everything the summary needs that only the per-booking pass can know. */
export type MemberEfficiencyTotals = Omit<MemberEfficiencySummary, 'clubEfficiencyPct'>

const toSeconds = (value: string | number): number => Number(value)

const minutesBetween = (fromEpochSecs: number, toEpochSecs: number): number =>
  Math.round((toEpochSecs - fromEpochSecs) / 60)

const round2 = (value: number): number => Math.round(value * 100) / 100

const percent = (numerator: number, denominator: number): number =>
  denominator > 0 ? round2((numerator / denominator) * 100) : 0

interface FlightPart {
  flightId: string
  offBlockEpoch: number
  onBlockEpoch: number
  flightMins: number
}

/**
 * Groups the flat join into one entry per booking and derives the flags the report is
 * really about.
 *
 * Assumes every row it is given is for a booking that is finished or cancelled — the
 * queries below are what guarantee that, and it is why a booking with no flights can be
 * called a no-show here without asking what the time is.
 *
 * Exported so the gap rules can be tested without a database: they are the only part of
 * this module that encodes a judgement rather than a query.
 */
export const buildMemberEfficiency = (
  rows: MemberEfficiencyJoinRow[],
): { entries: MemberEfficiencyEntry[]; totals: MemberEfficiencyTotals } => {
  const bookings = new Map<
    string,
    { row: MemberEfficiencyJoinRow; flights: Map<string, FlightPart> }
  >()

  for (const row of rows) {
    let booking = bookings.get(row.bookingId)
    if (!booking) {
      booking = { row, flights: new Map() }
      bookings.set(row.bookingId, booking)
    }
    if (row.flightId != null && row.offBlockTimeEpoch != null && row.onBlockTimeEpoch != null) {
      booking.flights.set(row.flightId, {
        flightId: row.flightId,
        offBlockEpoch: toSeconds(row.offBlockTimeEpoch),
        onBlockEpoch: toSeconds(row.onBlockTimeEpoch),
        flightMins: row.flightMins ?? 0,
      })
    }
  }

  // Counted once per flight even when two overlapping bookings both show it.
  const countedFlights = new Map<string, number>()
  let totalReservedMins = 0
  let cancelledCount = 0
  let underusedCount = 0
  let noShowCount = 0

  const entries = [...bookings.values()].map(({ row, flights }) => {
    const startEpoch = toSeconds(row.startTimeEpoch)
    const endEpoch = toSeconds(row.endTimeEpoch)
    const reservedMins = minutesBetween(startEpoch, endEpoch)
    const isCancelled = row.bookingStatus === BookingStatus.CANCELLED

    const parts = [...flights.values()].sort((a, b) => a.offBlockEpoch - b.offBlockEpoch)
    const flightMins = parts.reduce((sum, part) => sum + part.flightMins, 0)

    // Only idle time at the ends of the slot counts: a gap between two matched flights
    // is a cross-country stop, not an aircraft parked at home while the slot ran on.
    const headGapMins =
      parts.length > 0 ? Math.max(0, minutesBetween(startEpoch, parts[0]!.offBlockEpoch)) : null
    const tailGapMins =
      parts.length > 0
        ? Math.max(0, minutesBetween(parts[parts.length - 1]!.onBlockEpoch, endEpoch))
        : null

    const isUnderused =
      headGapMins != null &&
      tailGapMins != null &&
      (headGapMins > HEAD_GAP_THRESHOLD_MINS || tailGapMins > TAIL_GAP_THRESHOLD_MINS)

    if (isCancelled) {
      cancelledCount += 1
    } else {
      totalReservedMins += reservedMins
      if (parts.length === 0) noShowCount += 1
      for (const part of parts) countedFlights.set(part.flightId, part.flightMins)
    }
    if (isUnderused) underusedCount += 1

    return {
      bookingId: row.bookingId,
      registration: row.registration,
      status: row.bookingStatus as BookingStatus,
      type: row.bookingType as BookingType,
      startTime: row.startTimeUtc.toISOString(),
      endTime: row.endTimeUtc.toISOString(),
      reservedMins,
      flightMins,
      efficiencyPct: percent(flightMins, reservedMins),
      flightCount: parts.length,
      headGapMins,
      tailGapMins,
      isUnderused,
      cancellationReason: (row.cancellationReason as CancellationReason | null) ?? null,
      cancellationNote: row.cancellationNote,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledNoticeHours: row.cancelledAt
        ? round2((startEpoch - row.cancelledAt.getTime() / 1000) / 3600)
        : null,
    } satisfies MemberEfficiencyEntry
  })

  const totalFlightMins = [...countedFlights.values()].reduce((sum, mins) => sum + mins, 0)

  return {
    entries,
    totals: {
      bookingCount: entries.length,
      cancelledCount,
      underusedCount,
      noShowCount,
      totalReservedMins,
      totalFlightMins,
      memberEfficiencyPct: percent(totalFlightMins, totalReservedMins),
    },
  }
}

const epochOf = (isoDateTime: string): string => dayjs(isoDateTime).unix().toString()

/** The present moment, as the same string epoch the window bounds use. */
const nowEpoch = (): string => dayjs().unix().toString()

/**
 * The club over the same window, on the same basis as the member's own figure: minutes
 * flown out of a live reservation over minutes reserved.
 *
 * Deliberately not `stats.reservation_efficiency_by_yr`, which is fixed to calendar
 * years and divides *all* logged airtime — including flights made with no reservation at
 * all — by reserved time. Comparing a member's matched-only numerator against that would
 * flatter the club and make every member look wasteful.
 */
export const getClubEfficiencyPct = async (
  from: string,
  to: string,
  /**
   * The moment reservations stop counting, passed in by the caller so the member and
   * the club are held to one cut-off rather than to two readings of the clock. Same
   * value either way; taking it twice would just leave a second where a booking could
   * belong to one side of the comparison and not the other.
   */
  endedBy: string = nowEpoch(),
): Promise<number> => {
  const fromEpoch = epochOf(from)
  const toEpoch = epochOf(to)

  // Independent of each other and of the member's own rows, so nothing waits its turn.
  const [reserved, flown] = await Promise.all([
    db
      .selectFrom('schedule.bookings')
      .select(sql<string>`coalesce(sum((end_time_epoch - start_time_epoch) / 60.0), 0)`.as('mins'))
      .where('bookingStatus', '!=', BookingStatus.CANCELLED)
      .where('endTimeEpoch', '>=', fromEpoch)
      .where('endTimeEpoch', '<=', endedBy)
      .where('startTimeEpoch', '<=', toEpoch)
      .executeTakeFirst(),

    // EXISTS rather than a join, so a flight spanning two overlapping bookings counts once.
    db
      .selectFrom('flight.logs as f')
      .select(sql<string>`coalesce(sum(f.flight_mins), 0)`.as('mins'))
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('schedule.bookings as b')
            .select(sql<number>`1`.as('matched'))
            .whereRef('b.registration', '=', 'f.aircraftRegistration')
            .where('b.bookingStatus', '!=', BookingStatus.CANCELLED)
            .where('b.endTimeEpoch', '>=', fromEpoch)
            .where('b.endTimeEpoch', '<=', endedBy)
            .where('b.startTimeEpoch', '<=', toEpoch)
            .whereRef('f.offBlockTimeEpoch', '<', 'b.endTimeEpoch')
            .whereRef('f.onBlockTimeEpoch', '>', 'b.startTimeEpoch'),
        ),
      )
      .executeTakeFirst(),
  ])

  return percent(Number(flown?.mins ?? 0), Number(reserved?.mins ?? 0))
}

export const getMemberReservationEfficiency = async (
  memberId: string,
  from: string,
  to: string,
): Promise<MemberEfficiencyResponse> => {
  const fromEpoch = epochOf(from)
  const toEpoch = epochOf(to)
  const endedBy = nowEpoch()

  const rowsPromise = db
    .selectFrom('schedule.bookings as b')
    .leftJoin('flight.logs as f', (join) =>
      join
        .onRef('f.aircraftRegistration', '=', 'b.registration')
        .onRef('f.offBlockTimeEpoch', '<', 'b.endTimeEpoch')
        .onRef('f.onBlockTimeEpoch', '>', 'b.startTimeEpoch')
        .on('b.bookingStatus', '!=', BookingStatus.CANCELLED),
    )
    .select([
      'b.bookingId',
      'b.registration',
      'b.bookingStatus',
      'b.bookingType',
      'b.startTimeEpoch',
      'b.endTimeEpoch',
      'b.startTimeUtc',
      'b.endTimeUtc',
      'b.cancellationReason',
      'b.cancellationNote',
      'b.cancelledAt',
      'f.flightId',
      'f.offBlockTimeEpoch',
      'f.onBlockTimeEpoch',
      'f.flightMins',
    ])
    .where('b.memberId', '=', memberId)
    .where('b.endTimeEpoch', '>=', fromEpoch)
    .where('b.startTimeEpoch', '<=', toEpoch)
    // `to` is the end of *today* for both callers, so without this a reservation still
    // to come — or one in the air right now — would be listed with nothing flown against
    // it and counted a no-show. A cancellation is already a complete fact, so those stay
    // however far ahead their slot was.
    .where((eb) =>
      eb.or([
        eb('b.endTimeEpoch', '<=', endedBy),
        eb('b.bookingStatus', '=', BookingStatus.CANCELLED),
      ]),
    )
    .orderBy('b.startTimeEpoch', 'desc')
    .orderBy('f.offBlockTimeEpoch', 'asc')
    .execute()

  // The club figure shares only `from`/`to` with the member's rows, so the two round
  // trips overlap rather than queue.
  const [rows, clubEfficiencyPct] = await Promise.all([
    rowsPromise,
    getClubEfficiencyPct(from, to, endedBy),
  ])

  const { entries, totals } = buildMemberEfficiency(rows)

  return {
    memberId,
    from,
    to,
    summary: { ...totals, clubEfficiencyPct },
    entries,
  }
}
