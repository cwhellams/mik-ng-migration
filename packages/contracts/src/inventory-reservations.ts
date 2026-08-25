import { z } from 'zod'
import { ItemUnitStatusEnum } from './inventory-units.ts'
import {
  AuditableSchema,
  BigintAsString,
  BooleanSchema,
  LocalisedSchema,
  nullableTrimmedString,
  optionalTrimmedString,
  UpsertSchema,
} from './schema.ts'

/**
 * Item reservations (#1139) — the club's non-aircraft equipment on its own
 * calendar, kept apart from `schedule.bookings` so oxygen tanks and life vests
 * don't flood the plane calendar.
 *
 * Modelled on `bookings.ts`, but deliberately not a generalisation of it: an
 * item reservation has no instructor, no medical currency, no transfer, and no
 * cancellation-reason taxonomy. It has two things a booking doesn't — a
 * `quantity` (three vests are one reservation) and an optional
 * `linkedBookingId` (the flight the equipment is going on).
 */

export enum ItemReservationStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ceiling on a single reservation's quantity. Well inside PostgreSQL's INTEGER
 * range so an absurd input is a 400 at parse time rather than a DB range error,
 * and the capacity trigger rejects anything beyond the item's real unit count
 * anyway.
 */
const MAX_RESERVATION_QUANTITY = 1000

export const ItemReservationSchema = AuditableSchema.extend({
  reservationId: z.string().readonly(),
  memberId: z.string(),
  member: z
    .object({
      firstName: z.string().optional().readonly(),
      lastName: z.string().optional().readonly(),
      phoneNumber: z.string().optional().nullable().readonly(),
    })
    .optional()
    .readonly(),
  itemId: z.string().max(9),
  /**
   * Enough of the item and unit to label a calendar event, joined in rather
   * than the whole nested entities: the calendar needs a name and a tag, and
   * embedding `InventoryItemSchema` would drag an item's stock levels, audit
   * columns and category through every reservation payload.
   */
  itemName: LocalisedSchema.optional().readonly(),
  /** A specific physical unit, or null for "any unit from the pool". */
  unitId: z.string().max(9).nullable().optional(),
  unitTag: z.string().nullable().optional().readonly(),
  unitStatus: ItemUnitStatusEnum.nullable().optional().readonly(),
  quantity: z.number().int().positive().max(MAX_RESERVATION_QUANTITY).default(1),
  /** The flight booking this equipment is going on, when there is one. */
  linkedBookingId: z.string().nullable().optional(),
  status: z.nativeEnum(ItemReservationStatus),
  startTimeEpoch: BigintAsString,
  startTime: z.string().datetime(),
  endTimeEpoch: BigintAsString,
  endTime: z.string().datetime(),
  description: optionalTrimmedString(z.string().max(500)),
  cancelledBy: z.string().nullable().nullish(),
  cancelledAt: z.string().datetime().nullish(),
  cancellationNote: nullableTrimmedString(z.string().max(500)).nullish(),
  createdByName: z.string().nullish(),
  updatedByName: z.string().nullish(),
  cancelledByName: z.string().nullish(),
})
export type ItemReservation = z.infer<typeof ItemReservationSchema>

export const ItemReservationUpsertSchema = UpsertSchema(ItemReservationSchema)
  .pick({
    memberId: true,
    itemId: true,
    unitId: true,
    quantity: true,
    linkedBookingId: true,
    status: true,
    startTimeEpoch: true,
    endTimeEpoch: true,
    description: true,
  })
  .strip()
export type ItemReservationUpsertRequest = z.infer<typeof ItemReservationUpsertSchema>

/**
 * The two rules `inventory.reservations`' CHECK constraints enforce, restated
 * where a client can see them.
 *
 * A plain function rather than only a Zod refinement because a PATCH is
 * partial: `{ endTimeEpoch }` alone says nothing about ordering, so the backend
 * has to run the same rule again over the patch merged onto the stored row. One
 * implementation, two call sites — otherwise the copy that isn't exercised is
 * the one that drifts, and the failure mode is a 500 from Postgres rather than
 * a 400 anyone can act on.
 */
export const reservationInvariantError = (reservation: {
  unitId?: string | null
  quantity: number
  startTimeEpoch: string
  endTimeEpoch: string
}): string | undefined => {
  if (Number(reservation.endTimeEpoch) <= Number(reservation.startTimeEpoch)) {
    return 'End time must be after start time'
  }
  if (reservation.unitId && reservation.quantity !== 1) {
    return 'A reservation for a specific unit covers exactly one unit'
  }
  return undefined
}

/**
 * The overlap rule `inventory.check_reservation_capacity()` (V1950) applies,
 * restated where a client can see it: half-open, so a reservation that ends
 * exactly when another starts does not overlap it — handing a vest over at 11:00
 * is a handover, not a clash.
 *
 * The list endpoint's `from`/`to` filter is deliberately *inclusive* by
 * comparison, because a calendar wants the event that ends on the hour its week
 * begins. The two boundaries therefore disagree by design, and a client sizing
 * up a window has to re-apply this rule to what the list gave it rather than
 * treat every row as a collision.
 */
export const reservationOverlapsWindow = (
  reservation: { startTimeEpoch: string; endTimeEpoch: string },
  window: { startTimeEpoch: string; endTimeEpoch: string },
): boolean =>
  Number(reservation.startTimeEpoch) < Number(window.endTimeEpoch) &&
  Number(reservation.endTimeEpoch) > Number(window.startTimeEpoch)

/**
 * How much of an item's capacity a set of reservations already holds in a
 * window — the client-side twin of `getCommittedQuantity()` in
 * `item-reservation-queries.ts`, down to which rows it counts: CONFIRMED only,
 * overlap half-open.
 *
 * Cancelled rows are filtered rather than assumed absent, because the list
 * endpoint returns them whenever `showCancelled` is set, and a cancelled
 * reservation holds nothing.
 */
export const committedQuantity = (
  reservations: readonly {
    status: ItemReservationStatus
    quantity: number
    startTimeEpoch: string
    endTimeEpoch: string
  }[],
  window: { startTimeEpoch: string; endTimeEpoch: string },
): number =>
  reservations.reduce(
    (total, reservation) =>
      reservation.status === ItemReservationStatus.CONFIRMED &&
      reservationOverlapsWindow(reservation, window)
        ? total + reservation.quantity
        : total,
    0,
  )

/**
 * What `POST /inventory-reservations` parses: the full upsert plus the
 * invariants, so a bad window is a field error rather than a bare message.
 * PATCH keeps using `ItemReservationUpsertSchema.partial()` — `.superRefine()`
 * returns an effect, which has no `.partial()` — and re-runs
 * `reservationInvariantError` on the merged reservation instead.
 */
export const ItemReservationCreateSchema = ItemReservationUpsertSchema.superRefine(
  (reservation, ctx) => {
    const error = reservationInvariantError(reservation)
    if (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error,
        path: [error.startsWith('End time') ? 'endTimeEpoch' : 'quantity'],
      })
    }
  },
)

export const ItemReservationFiltersSchema = z
  .object({
    reservationId: z.string().optional(),
    memberId: z.string().optional(),
    itemId: z.union([z.string(), z.array(z.string())]).optional(),
    linkedBookingId: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    showCancelled: BooleanSchema.optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
    excludeReservationId: z.string().optional(),
  })
  .strict()
export type ItemReservationFilters = z.infer<typeof ItemReservationFiltersSchema>

export const ItemReservationListResponseSchema = z.object({
  reservations: z.array(ItemReservationSchema),
})
export type ItemReservationListResponse = z.infer<typeof ItemReservationListResponseSchema>

export const ItemReservationCancellationSchema = z.object({
  note: optionalTrimmedString(z.string().max(500)),
})
export type ItemReservationCancellationRequest = z.infer<typeof ItemReservationCancellationSchema>
