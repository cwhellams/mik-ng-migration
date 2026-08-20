import { z } from 'zod'
import { BookingStatus, BookingType, CancellationReason } from './bookings.ts'

/**
 * Per-member reservation efficiency (issue #1174).
 *
 * The club-wide report in `stats.ts` is aggregated and its "by member" dimension is
 * MD5-hashed on purpose, so it can never be drilled into a real person. This is the
 * other half: one named member, booking by booking, for an admin checking whether the
 * club's aircraft are being tied up without being flown.
 *
 * Two numbers exist per booking and they answer different questions:
 *
 * - `efficiencyPct` — how much of the reserved slot was flown. Low on its own is not
 *   an accusation; a 3h slot with a 1h flight may be a perfectly reasonable margin.
 * - `isUnderused` — whether the aircraft sat idle *at the ends* of the slot, which is
 *   when it was unavailable to everyone else. See {@link MemberEfficiencyEntrySchema}.
 */

/** Minutes of unused slot before the first flight past which a booking is flagged. */
export const HEAD_GAP_THRESHOLD_MINS = 30

/** Minutes of unused slot after the last flight past which a booking is flagged. */
export const TAIL_GAP_THRESHOLD_MINS = 60

/** Default reporting window when the caller names neither end. */
export const DEFAULT_PERIOD_MONTHS = 12

export const MemberEfficiencyFiltersSchema = z.object({
  /** Inclusive start of the window; bookings ending before it are excluded. */
  from: z.string().datetime().optional(),
  /** Inclusive end of the window; bookings starting after it are excluded. */
  to: z.string().datetime().optional(),
})

export type MemberEfficiencyFilters = z.infer<typeof MemberEfficiencyFiltersSchema>

export const MemberEfficiencyEntrySchema = z.object({
  bookingId: z.string(),
  registration: z.string(),
  status: z.nativeEnum(BookingStatus),
  type: z.nativeEnum(BookingType),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  /** Length of the reservation itself, cancelled ones included. */
  reservedMins: z.number(),
  /** Airtime of every flight log matched to this booking, summed. */
  flightMins: z.number(),
  /** `flightMins / reservedMins * 100`, 0 for a cancelled or unflown booking. */
  efficiencyPct: z.number(),
  /** How many flight logs were matched to the booking. */
  flightCount: z.number(),
  /** Idle minutes between the slot opening and the first flight's off-block. */
  headGapMins: z.number().nullable(),
  /** Idle minutes between the last flight's on-block and the slot closing. */
  tailGapMins: z.number().nullable(),
  /**
   * True when `headGapMins` or `tailGapMins` exceeds its threshold — the aircraft was
   * parked at either end of a slot nobody else could book. Gaps *between* two matched
   * flights are deliberately not counted: a cross-country with a stop is normal use.
   */
  isUnderused: z.boolean(),
  cancellationReason: z.nativeEnum(CancellationReason).nullable(),
  cancellationNote: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  /** How long before the slot started the cancellation came in; null if never cancelled. */
  cancelledNoticeHours: z.number().nullable(),
})

export type MemberEfficiencyEntry = z.infer<typeof MemberEfficiencyEntrySchema>

export const MemberEfficiencySummarySchema = z.object({
  /** Bookings in the window, cancelled ones included. */
  bookingCount: z.number(),
  cancelledCount: z.number(),
  underusedCount: z.number(),
  /** Non-cancelled bookings with no matching flight log at all. */
  noShowCount: z.number(),
  totalReservedMins: z.number(),
  totalFlightMins: z.number(),
  /**
   * The member's efficiency over the window, on the same basis as the club figure:
   * flown minutes over reserved minutes of non-cancelled bookings.
   */
  memberEfficiencyPct: z.number(),
  /** The whole club over the same window, so the member's number means something. */
  clubEfficiencyPct: z.number(),
})

export type MemberEfficiencySummary = z.infer<typeof MemberEfficiencySummarySchema>

export const MemberEfficiencyResponseSchema = z.object({
  memberId: z.string(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  summary: MemberEfficiencySummarySchema,
  /** Newest booking first. */
  entries: z.array(MemberEfficiencyEntrySchema),
})

export type MemberEfficiencyResponse = z.infer<typeof MemberEfficiencyResponseSchema>
