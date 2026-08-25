import {
  ItemReservationCancellationSchema,
  ItemReservationCreateSchema,
  ItemReservationFiltersSchema,
  ItemReservationStatus,
  ItemReservationUpsertSchema,
  reservationInvariantError,
  type ItemReservation,
  type ItemReservationFilters,
  type ItemReservationListResponse,
} from '@mik/contracts/inventory-reservations'
import { isInServiceUnitStatus } from '@mik/contracts/inventory-units'
import { MIKPermissions } from '@mik/contracts/members'
import { Router, type Request, type Response } from 'express'

import { getBookingById } from '../../db/booking-queries.ts'
import { getItemById } from '../../db/inventory-queries.ts'
import {
  ReservationCapacityError,
  cancelReservation,
  getCommittedQuantity,
  getReservationById,
  getReservations,
  hasUnitConflict,
  insertReservation,
  updateReservation,
} from '../../db/item-reservation-queries.ts'
import { getInServiceUnitCount, getUnitById } from '../../db/item-unit-queries.ts'
import { getMemberById } from '../../db/member-queries.ts'
import logger from '../../lib/logger.ts'
import { sendEmail } from '../../lib/sendGmail.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { itemReservationEmailVars } from '../../templates/itemReservationEmailHelpers.ts'
import { renderEmail } from '../../templates/renderEmail.ts'
import { type JWTUser } from '../auth/token.ts'
import { onlySent } from '../patchBody.ts'
import { problem } from '../response.ts'

/**
 * Reservations for the club's non-aircraft equipment (#1139).
 *
 * A sibling of `/api/v1/bookings`, not a mode of it: an oxygen tank has no
 * instructor, no medical currency and no transfer. The permission pair is its
 * own too — `INVENTORY_RESERVATION_*` rather than `INVENTORY_*` — because
 * reserving a vest and editing the inventory catalog are different privileges,
 * the same way `BOOKING_USER` is distinct from `AIRCRAFT_USER`. Managing the
 * physical units themselves stays with the catalog, under `/api/v1/inventory`.
 */
const router = Router()
router.use(
  validateUser(
    MIKPermissions.INVENTORY_RESERVATION_USER,
    MIKPermissions.INVENTORY_RESERVATION_ADMIN,
  ),
)

const isReservationAdmin = (user?: JWTUser): boolean =>
  user?.permissions?.includes(MIKPermissions.INVENTORY_RESERVATION_ADMIN) ?? false

const validateWriteAccess = (
  reservation: Pick<ItemReservation, 'memberId'>,
  req: Request<Record<string, string>>,
) => {
  if (reservation.memberId !== req.user?.memberId && !isReservationAdmin(req.user)) {
    return problem({
      status: 403,
      detail: 'Reservation not owned by user or user has no admin rights',
    })
  }
}

type ReservationDraft = {
  itemId: string
  unitId?: string | null
  quantity: number
  linkedBookingId?: string | null
  startTimeEpoch: string
  endTimeEpoch: string
}

/**
 * Everything that has to hold before a reservation is written, other than
 * capacity: the item exists, is active and is meant to be reservable; a named
 * unit belongs to that item and is in service; a linked booking exists.
 *
 * Kept apart from the capacity check below because these are all "you asked for
 * something that isn't there" — a 400 that no retry at another time would fix.
 *
 * `holdsCapacity` is false for a reservation on its way to CANCELLED, which
 * holds nothing: a unit that has gone to MAINTENANCE since it was reserved must
 * not stand between a member and cancelling.
 */
const validateReservationRefs = async (draft: ReservationDraft, holdsCapacity: boolean) => {
  // Re-checked here rather than trusted from the request body, because a PATCH
  // can move one end of the window and leave the other where it was.
  const invariantError = reservationInvariantError(draft)
  if (invariantError) {
    return problem({ status: 400, detail: invariantError })
  }

  const item = await getItemById(draft.itemId)
  if (!item || !item.isActive) {
    return problem({ status: 400, detail: `Item '${draft.itemId}' does not exist` })
  }
  if (!item.isReservable) {
    return problem({ status: 400, detail: 'This item cannot be reserved' })
  }

  // Independent of each other once the item is known, so one round trip rather
  // than two on the create/patch path — which already pays for the capacity
  // check after this.
  const [unit, linkedBooking] = await Promise.all([
    draft.unitId ? getUnitById(draft.unitId) : undefined,
    draft.linkedBookingId ? getBookingById(draft.linkedBookingId) : undefined,
  ])

  if (draft.unitId) {
    if (!unit || unit.itemId !== draft.itemId) {
      return problem({ status: 400, detail: 'Unit does not belong to this item' })
    }
    if (!unit.isActive) {
      return problem({ status: 400, detail: 'This unit has been retired' })
    }
    // In service is not the same as active. A unit in MAINTENANCE, LOST or
    // RETIRED status is still an active row, but `in_service_unit_count()` does
    // not count it, so naming one here would both promise a unit the club
    // cannot hand over and slip past the capacity check — the pooled total it
    // is measured against excludes that unit. The predicate is the contracts
    // copy of the function's, so the two cannot drift.
    if (holdsCapacity && !isInServiceUnitStatus(unit.status)) {
      return problem({ status: 400, detail: 'This unit is not in service' })
    }
  }

  if (draft.linkedBookingId && !linkedBooking) {
    return problem({ status: 400, detail: `Booking '${draft.linkedBookingId}' does not exist` })
  }
}

/**
 * The friendly half of the capacity check.
 *
 * `inventory.check_reservation_capacity()` is the authority and would reject
 * this anyway; asking first turns the raw Postgres exception into a message
 * that says how many units are actually free. A concurrent reservation can
 * still slip in between this read and the write, which is exactly why the
 * trigger exists — `ReservationCapacityError` covers that race.
 *
 * Both of the trigger's rules, in the trigger's order: a reservation naming a
 * specific unit must not collide with another naming that unit, and must still
 * fit in the item's pool. Checking only the pool half would let a member who
 * picked "the tank with the full gauge" past a message counting free units, and
 * then fail on the other rule at the write — a clean 400 either way, but about
 * something the pre-check had just called fine.
 */
const checkCapacity = async (draft: ReservationDraft, excludeReservationId?: string) => {
  const [inService, committed, unitTaken] = await Promise.all([
    getInServiceUnitCount(draft.itemId),
    getCommittedQuantity(
      draft.itemId,
      draft.startTimeEpoch,
      draft.endTimeEpoch,
      excludeReservationId,
    ),
    draft.unitId
      ? hasUnitConflict(
          draft.unitId,
          draft.startTimeEpoch,
          draft.endTimeEpoch,
          excludeReservationId,
        )
      : Promise.resolve(false),
  ])

  // Worded exactly as the trigger words it, so the race-loser's 400 and this
  // one don't describe the same collision two different ways.
  if (unitTaken) {
    return problem({
      status: 400,
      detail: 'This unit is already reserved for an overlapping time',
    })
  }

  const available = inService - committed
  if (draft.quantity > available) {
    return problem({
      status: 400,
      detail: `Only ${Math.max(available, 0)} of ${inService} units are free for that time`,
    })
  }
}

type ReservationEmailKind = 'confirmed' | 'updated' | 'cancelled'

const TEMPLATE_BY_KIND = {
  confirmed: 'item-reservation-confirmed',
  updated: 'item-reservation-updated',
  cancelled: 'item-reservation-cancelled',
} as const

/**
 * Tell the reservation's owner what happened to it — the same courtesy the
 * booking routes extend, and the reason an admin can cancel someone's vests
 * without them finding out at the hangar.
 *
 * Not awaited by the handlers (delivery shouldn't hold up the response), so a
 * failure is caught and logged here rather than becoming an unhandled rejection
 * that would take the process down.
 */
const notifyOwner = (reservation: ItemReservation, kind: ReservationEmailKind): void => {
  const send = async () => {
    const member = await getMemberById(reservation.memberId)
    if (!member?.email) return

    const vars = itemReservationEmailVars(reservation, member.lang, {
      firstName: member.firstName ?? '',
    })

    const { subject, html } =
      kind === 'cancelled'
        ? renderEmail(TEMPLATE_BY_KIND.cancelled, member.lang, {
            ...vars,
            cancellationNote: reservation.cancellationNote ?? '',
          })
        : renderEmail(TEMPLATE_BY_KIND[kind], member.lang, vars)

    await sendEmail(member.email, subject, html)
  }

  send().catch((error) => {
    logger.error(
      `Failed to send item reservation ${kind} notification for ${reservation.reservationId}: ${error}`,
    )
  })
}

// Create a reservation
router.post('/', async (req: Request<Record<string, string>>, res: Response) => {
  const data = ItemReservationCreateSchema.parse(req.body)

  const isAdmin = isReservationAdmin(req.user)
  if (!isAdmin && data.memberId !== req.user!.memberId) {
    return problem({ status: 400, detail: 'Invalid member id' })
  }

  // The same per-member suspension that gates aircraft bookings, reused rather
  // than duplicated: a member who may not book a plane may not book its kit.
  if (!isAdmin && req.user?.canMakeReservations !== true) {
    return problem({ status: 400, detail: 'Reservations suspended' })
  }

  const confirmed = data.status === ItemReservationStatus.CONFIRMED

  const refError = await validateReservationRefs(data, confirmed)
  if (refError) return refError

  if (confirmed) {
    const capacityError = await checkCapacity(data)
    if (capacityError) return capacityError
  }

  try {
    const reservation = await insertReservation(data, req.user!)
    notifyOwner(reservation, 'confirmed')
    res.status(201).json(reservation)
  } catch (error) {
    if (error instanceof ReservationCapacityError) {
      return problem({ status: 400, detail: error.message })
    }
    throw error
  }
})

// List reservations
router.get(
  '/',
  async (req: Request<ItemReservationFilters>, res: Response<ItemReservationListResponse>) => {
    const filters = ItemReservationFiltersSchema.parse(req.query)

    // As with the plane calendar, the item calendar is shared: any member sees
    // who has the vests. What a non-admin may not do is single out another
    // member's reservations.
    if (
      !isReservationAdmin(req.user) &&
      filters.memberId &&
      filters.memberId !== req.user!.memberId
    ) {
      return problem({ status: 403, detail: 'Cannot query reservations for another member' })
    }

    const reservations = await getReservations(filters)
    res.status(200).json({ reservations })
  },
)

// Get one reservation
// Caution — keep this last among the GET routes so the fixed paths match first.
router.get('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const reservation = await getReservationById(req.params.id)
  if (!reservation) {
    return problem({ status: 404, detail: 'Reservation not found' })
  }

  res.status(200).json(reservation)
})

// Update a reservation
router.patch('/:id', async (req: Request<Record<string, string>>, res: Response) => {
  const reservationId = req.params.id
  // `onlySent` because Zod re-applies `quantity`'s `.default(1)` even under
  // `.partial()`: without it the calendar's drag-and-resize PATCH, which sends
  // nothing but the two timestamps, arrives claiming `quantity: 1` and
  // collapses a three-vest reservation to one. See routes/patchBody.ts.
  const patch = onlySent(ItemReservationUpsertSchema.partial().parse(req.body), req.body)

  const reservation = await getReservationById(reservationId)
  if (!reservation) {
    return problem({ status: 404, detail: 'Reservation not found' })
  }
  const accessError = validateWriteAccess(reservation, req)
  if (accessError) return accessError

  const isAdmin = isReservationAdmin(req.user)
  if (!isAdmin) {
    if (patch.memberId && patch.memberId !== req.user!.memberId) {
      return problem({ status: 400, detail: 'Invalid member id' })
    }
    if (req.user?.canMakeReservations !== true) {
      return problem({ status: 400, detail: 'Reservations suspended' })
    }
  }

  // The patch is partial, so every check runs against the merged reservation
  // rather than the fields that happen to be in the body.
  const merged: ReservationDraft = {
    itemId: patch.itemId ?? reservation.itemId,
    unitId: patch.unitId !== undefined ? patch.unitId : reservation.unitId,
    quantity: patch.quantity ?? reservation.quantity,
    linkedBookingId:
      patch.linkedBookingId !== undefined ? patch.linkedBookingId : reservation.linkedBookingId,
    startTimeEpoch: patch.startTimeEpoch ?? reservation.startTimeEpoch,
    endTimeEpoch: patch.endTimeEpoch ?? reservation.endTimeEpoch,
  }

  const stillConfirmed = (patch.status ?? reservation.status) === ItemReservationStatus.CONFIRMED

  const refError = await validateReservationRefs(merged, stillConfirmed)
  if (refError) return refError

  if (stillConfirmed) {
    const capacityError = await checkCapacity(merged, reservationId)
    if (capacityError) return capacityError
  }

  try {
    const updated = await updateReservation(reservationId, patch, req.user!)
    if (!updated) {
      return problem({ status: 500, detail: 'Reservation update failed' })
    }

    notifyOwner(
      updated,
      updated.status === ItemReservationStatus.CANCELLED ? 'cancelled' : 'updated',
    )
    res.status(200).json(updated)
  } catch (error) {
    if (error instanceof ReservationCapacityError) {
      return problem({ status: 400, detail: error.message })
    }
    throw error
  }
})

// Cancel a reservation
router.post('/:id/cancel', async (req: Request<Record<string, string>>, res: Response) => {
  const reservationId = req.params.id
  const { note } = ItemReservationCancellationSchema.parse(req.body)

  const reservation = await getReservationById(reservationId)
  if (!reservation) {
    return problem({ status: 404, detail: 'Reservation not found' })
  }
  if (reservation.status === ItemReservationStatus.CANCELLED) {
    return problem({ status: 409, detail: 'Reservation already cancelled' })
  }
  const accessError = validateWriteAccess(reservation, req)
  if (accessError) return accessError

  logger.info(
    `Cancelling item reservation ${reservationId} by member ${req.user?.memberId} with permissions: ${req.user?.permissions}`,
  )

  const cancelled = await cancelReservation(reservationId, req.user!, note)
  if (!cancelled) {
    return problem({ status: 500, detail: 'Reservation cancellation failed' })
  }

  notifyOwner(cancelled, 'cancelled')
  res.status(200).json(cancelled)
})

export default router
