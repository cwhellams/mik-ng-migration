import { BookingStatus, BookingType, CancellationReason } from '@mik/contracts/bookings'
import { HEAD_GAP_THRESHOLD_MINS, TAIL_GAP_THRESHOLD_MINS } from '@mik/contracts/member-efficiency'

import {
  buildMemberEfficiency,
  type MemberEfficiencyJoinRow,
} from '../../src/db/member-efficiency-queries.ts'

const MINUTE = 60
const HOUR = 60 * MINUTE

/** 2026-01-05 08:00 UTC — a fixed Monday, so nothing here depends on the clock. */
const SLOT_START = Math.floor(Date.UTC(2026, 0, 5, 8, 0, 0) / 1000)

interface FlightSpec {
  flightId: string
  offBlockEpoch: number
  onBlockEpoch: number
  /** Airtime, i.e. takeoff→landing, which is always shorter than the block time. */
  flightMins: number
}

interface BookingSpec {
  bookingId: string
  startEpoch: number
  endEpoch: number
  status?: BookingStatus
  registration?: string
  cancelledAt?: Date
  cancellationReason?: CancellationReason
  cancellationNote?: string
}

/**
 * Builds the flat left-join the query produces: one row per matched flight, or a single
 * row with null flight columns when nothing matched.
 */
const rowsFor = (booking: BookingSpec, flights: FlightSpec[] = []): MemberEfficiencyJoinRow[] => {
  const base = {
    bookingId: booking.bookingId,
    registration: booking.registration ?? 'OH-STL',
    bookingStatus: booking.status ?? BookingStatus.CONFIRMED,
    bookingType: BookingType.PRIVATE,
    startTimeEpoch: String(booking.startEpoch),
    endTimeEpoch: String(booking.endEpoch),
    startTimeUtc: new Date(booking.startEpoch * 1000),
    endTimeUtc: new Date(booking.endEpoch * 1000),
    cancellationReason: booking.cancellationReason ?? null,
    cancellationNote: booking.cancellationNote ?? null,
    cancelledAt: booking.cancelledAt ?? null,
  }

  if (flights.length === 0) {
    return [
      {
        ...base,
        flightId: null,
        offBlockTimeEpoch: null,
        onBlockTimeEpoch: null,
        flightMins: null,
      },
    ]
  }

  return flights.map((flight) => ({
    ...base,
    flightId: flight.flightId,
    offBlockTimeEpoch: String(flight.offBlockEpoch),
    onBlockTimeEpoch: String(flight.onBlockEpoch),
    flightMins: flight.flightMins,
  }))
}

describe('buildMemberEfficiency', () => {
  it('should report a promptly flown booking at its true efficiency and not flag it', () => {
    // 09:00–12:00 reserved, off-block 09:10, on-block 11:50, 2h30 airborne.
    const { entries, totals } = buildMemberEfficiency(
      rowsFor({ bookingId: 'b-tidy', startEpoch: SLOT_START, endEpoch: SLOT_START + 3 * HOUR }, [
        {
          flightId: 'f-1',
          offBlockEpoch: SLOT_START + 10 * MINUTE,
          onBlockEpoch: SLOT_START + 2 * HOUR + 50 * MINUTE,
          flightMins: 150,
        },
      ]),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      bookingId: 'b-tidy',
      reservedMins: 180,
      flightMins: 150,
      flightCount: 1,
      efficiencyPct: 83.33,
      headGapMins: 10,
      tailGapMins: 10,
      isUnderused: false,
    })
    expect(totals).toMatchObject({
      bookingCount: 1,
      cancelledCount: 0,
      underusedCount: 0,
      noShowCount: 0,
      totalReservedMins: 180,
      totalFlightMins: 150,
      memberEfficiencyPct: 83.33,
    })
  })

  it('should flag a booking whose flight started well after the slot opened', () => {
    const lateBy = HEAD_GAP_THRESHOLD_MINS + 15
    const { entries, totals } = buildMemberEfficiency(
      rowsFor(
        { bookingId: 'b-late-start', startEpoch: SLOT_START, endEpoch: SLOT_START + 4 * HOUR },
        [
          {
            flightId: 'f-2',
            offBlockEpoch: SLOT_START + lateBy * MINUTE,
            onBlockEpoch: SLOT_START + 4 * HOUR,
            flightMins: 180,
          },
        ],
      ),
    )

    expect(entries[0]).toMatchObject({ headGapMins: lateBy, tailGapMins: 0, isUnderused: true })
    expect(totals.underusedCount).toBe(1)
  })

  it('should not flag a late start that is still inside the head threshold', () => {
    const { entries } = buildMemberEfficiency(
      rowsFor(
        { bookingId: 'b-borderline', startEpoch: SLOT_START, endEpoch: SLOT_START + 4 * HOUR },
        [
          {
            flightId: 'f-3',
            offBlockEpoch: SLOT_START + HEAD_GAP_THRESHOLD_MINS * MINUTE,
            onBlockEpoch: SLOT_START + 4 * HOUR,
            flightMins: 200,
          },
        ],
      ),
    )

    expect(entries[0]).toMatchObject({ headGapMins: HEAD_GAP_THRESHOLD_MINS, isUnderused: false })
  })

  it('should flag a booking handed back long before the slot ran out', () => {
    const earlyBy = TAIL_GAP_THRESHOLD_MINS + 30
    const { entries, totals } = buildMemberEfficiency(
      rowsFor(
        { bookingId: 'b-early-return', startEpoch: SLOT_START, endEpoch: SLOT_START + 6 * HOUR },
        [
          {
            flightId: 'f-4',
            offBlockEpoch: SLOT_START,
            onBlockEpoch: SLOT_START + 6 * HOUR - earlyBy * MINUTE,
            flightMins: 260,
          },
        ],
      ),
    )

    expect(entries[0]).toMatchObject({ headGapMins: 0, tailGapMins: earlyBy, isUnderused: true })
    expect(totals.underusedCount).toBe(1)
  })

  it('should not flag a long stop between two flights of the same booking', () => {
    // A cross-country: out at 08:00, on the ground somewhere else for three hours,
    // home by 16:00. The aircraft was away, not parked at the club.
    const { entries, totals } = buildMemberEfficiency(
      rowsFor({ bookingId: 'b-xc', startEpoch: SLOT_START, endEpoch: SLOT_START + 8 * HOUR }, [
        {
          flightId: 'f-out',
          offBlockEpoch: SLOT_START + 5 * MINUTE,
          onBlockEpoch: SLOT_START + 2 * HOUR,
          flightMins: 105,
        },
        {
          flightId: 'f-back',
          offBlockEpoch: SLOT_START + 5 * HOUR,
          onBlockEpoch: SLOT_START + 8 * HOUR - 10 * MINUTE,
          flightMins: 165,
        },
      ]),
    )

    expect(entries[0]).toMatchObject({
      flightCount: 2,
      flightMins: 270,
      headGapMins: 5,
      tailGapMins: 10,
      isUnderused: false,
    })
    expect(totals.underusedCount).toBe(0)
  })

  it('should measure the gaps from the earliest and latest flight, whatever order the rows arrive in', () => {
    const { entries } = buildMemberEfficiency(
      rowsFor({ bookingId: 'b-order', startEpoch: SLOT_START, endEpoch: SLOT_START + 8 * HOUR }, [
        {
          flightId: 'f-back',
          offBlockEpoch: SLOT_START + 5 * HOUR,
          onBlockEpoch: SLOT_START + 8 * HOUR,
          flightMins: 170,
        },
        {
          flightId: 'f-out',
          offBlockEpoch: SLOT_START,
          onBlockEpoch: SLOT_START + 2 * HOUR,
          flightMins: 110,
        },
      ]),
    )

    // Taken in row order the head gap would read 5h and the booking would be flagged.
    expect(entries[0]).toMatchObject({ headGapMins: 0, tailGapMins: 0, isUnderused: false })
  })

  it('should surface a cancelled booking at zero efficiency with its reason and notice period', () => {
    const start = SLOT_START + 24 * HOUR
    const { entries, totals } = buildMemberEfficiency(
      rowsFor({
        bookingId: 'b-cancelled',
        startEpoch: start,
        endEpoch: start + 3 * HOUR,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date((start - 90 * MINUTE) * 1000),
        cancellationReason: CancellationReason.WEATHER_DEPARTURE,
        cancellationNote: 'Fog at EFHF',
      }),
    )

    expect(entries[0]).toMatchObject({
      status: BookingStatus.CANCELLED,
      reservedMins: 180,
      flightMins: 0,
      efficiencyPct: 0,
      flightCount: 0,
      headGapMins: null,
      tailGapMins: null,
      isUnderused: false,
      cancellationReason: CancellationReason.WEATHER_DEPARTURE,
      cancellationNote: 'Fog at EFHF',
      cancelledNoticeHours: 1.5,
    })
    // A released slot is nobody's waste, so it is out of both sides of the ratio.
    expect(totals).toMatchObject({
      cancelledCount: 1,
      noShowCount: 0,
      totalReservedMins: 0,
      memberEfficiencyPct: 0,
    })
  })

  it('should count a booking nobody flew as a no-show rather than as underuse', () => {
    const { entries, totals } = buildMemberEfficiency(
      rowsFor({ bookingId: 'b-noshow', startEpoch: SLOT_START, endEpoch: SLOT_START + 2 * HOUR }),
    )

    expect(entries[0]).toMatchObject({
      flightCount: 0,
      flightMins: 0,
      efficiencyPct: 0,
      headGapMins: null,
      tailGapMins: null,
      isUnderused: false,
    })
    expect(totals).toMatchObject({ noShowCount: 1, underusedCount: 0, totalReservedMins: 120 })
  })

  it('should count a flight once in the totals when two overlapping bookings both show it', () => {
    // Only *confirmed* bookings are kept apart by schedule.no_overlap_trigger, so a
    // tentative booking can sit on top of a confirmed one and match the same log.
    const shared: FlightSpec = {
      flightId: 'f-shared',
      offBlockEpoch: SLOT_START,
      onBlockEpoch: SLOT_START + 2 * HOUR,
      flightMins: 110,
    }
    const { entries, totals } = buildMemberEfficiency([
      ...rowsFor(
        { bookingId: 'b-confirmed', startEpoch: SLOT_START, endEpoch: SLOT_START + 2 * HOUR },
        [shared],
      ),
      ...rowsFor(
        {
          bookingId: 'b-tentative',
          startEpoch: SLOT_START,
          endEpoch: SLOT_START + 2 * HOUR,
          status: BookingStatus.TENTATIVE,
        },
        [shared],
      ),
    ])

    expect(entries.map((entry) => entry.flightMins)).toEqual([110, 110])
    expect(totals.totalReservedMins).toBe(240)
    expect(totals.totalFlightMins).toBe(110)
  })

  it('should ignore a duplicated join row for the same flight', () => {
    const row = rowsFor(
      { bookingId: 'b-dup', startEpoch: SLOT_START, endEpoch: SLOT_START + 2 * HOUR },
      [
        {
          flightId: 'f-dup',
          offBlockEpoch: SLOT_START,
          onBlockEpoch: SLOT_START + 2 * HOUR,
          flightMins: 110,
        },
      ],
    )

    const { entries } = buildMemberEfficiency([...row, ...row])

    expect(entries[0]).toMatchObject({ flightCount: 1, flightMins: 110 })
  })

  it('should clamp a flight that began before its slot to a zero head gap', () => {
    const { entries } = buildMemberEfficiency(
      rowsFor(
        { bookingId: 'b-early-off', startEpoch: SLOT_START, endEpoch: SLOT_START + 2 * HOUR },
        [
          {
            flightId: 'f-early',
            offBlockEpoch: SLOT_START - 20 * MINUTE,
            onBlockEpoch: SLOT_START + 2 * HOUR,
            flightMins: 130,
          },
        ],
      ),
    )

    expect(entries[0]).toMatchObject({ headGapMins: 0, isUnderused: false })
  })

  it('should return empty totals for a member with no bookings in the window', () => {
    const { entries, totals } = buildMemberEfficiency([])

    expect(entries).toEqual([])
    expect(totals).toEqual({
      bookingCount: 0,
      cancelledCount: 0,
      underusedCount: 0,
      noShowCount: 0,
      totalReservedMins: 0,
      totalFlightMins: 0,
      memberEfficiencyPct: 0,
    })
  })
})
