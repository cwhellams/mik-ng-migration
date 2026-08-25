import {
  ItemReservationStatus,
  type ItemReservation,
  type ItemReservationFilters,
  type ItemReservationUpsertRequest,
} from '@mik/contracts/inventory-reservations'
import type { ItemUnitStatus } from '@mik/contracts/inventory-units'
import dayjs from 'dayjs'
import { sql } from 'kysely'

import { auditCreate, auditUpdate } from './audit.ts'
import { db, type DbRow } from './connection.ts'
import type { JWTUser } from '../routes/auth/token.ts'
import { generateShortId } from '../util/nanoId.ts'

/**
 * Item reservations (#1139) — the query layer behind the item calendar.
 *
 * Filter composition mirrors `getBookings()` in `booking-queries.ts`, because
 * the calendar that consumes it is the same one: a from/to window, an optional
 * set of items instead of registrations, and cancelled rows hidden unless asked
 * for.
 *
 * Capacity is *not* re-derived here. `inventory.check_reservation_capacity()`
 * (V2030) is the single authority on whether there is room, so writes let it
 * raise and translate the exception; two implementations of that arithmetic
 * would eventually disagree under concurrency.
 */

/** Raised when the capacity trigger rejects a write, so the route can answer 400. */
export class ReservationCapacityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationCapacityError'
  }
}

/**
 * The messages `inventory.check_reservation_capacity()` raises. Matched on
 * rather than on Postgres error codes: a `RAISE EXCEPTION` without an explicit
 * SQLSTATE reports P0001 for all three, so the text is the only thing that
 * distinguishes them from any other plpgsql failure.
 */
const CAPACITY_ERRORS = [
  'Not enough available units for this item in the requested window',
  'This unit is already reserved for an overlapping time',
  'Unit does not belong to this item',
]

const isCapacityError = (error: unknown): error is Error =>
  error instanceof Error && CAPACITY_ERRORS.some((message) => error.message.includes(message))

/**
 * Runs a write and turns a capacity-trigger rejection into a typed domain error.
 * Anything else propagates unchanged — a constraint violation elsewhere is a
 * bug, not a 400.
 */
const translateCapacityErrors = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write()
  } catch (error) {
    if (isCapacityError(error)) {
      throw new ReservationCapacityError(error.message)
    }
    throw error
  }
}

type ReservationRow = DbRow<'inventory.reservations'> & {
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  unitTag: string | null
  unitStatus: ItemUnitStatus | null
  itemName: unknown
  createdByFirstName: string | null
  createdByLastName: string | null
  updatedByFirstName: string | null
  updatedByLastName: string | null
  cancelledByFirstName: string | null
  cancelledByLastName: string | null
}

const formatMemberName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | undefined =>
  firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : undefined

/**
 * The joined columns, as one chainable step so the list query, the by-id query
 * and the by-booking query cannot drift into returning different shapes.
 */
const selectReservation = () =>
  db
    .selectFrom('inventory.reservations')
    .selectAll(['inventory.reservations'])
    .innerJoin('member.register', 'inventory.reservations.memberId', 'member.register.memberId')
    .select([
      'member.register.firstName',
      'member.register.lastName',
      'member.register.phoneNumber',
    ])
    .leftJoin('inventory.itemUnits as unit', 'unit.unitId', 'inventory.reservations.unitId')
    .select([
      sql<string | null>`unit.tag`.as('unitTag'),
      sql<ItemUnitStatus | null>`unit.status`.as('unitStatus'),
    ])
    .innerJoin('inventory.items as item', 'item.itemId', 'inventory.reservations.itemId')
    .select([sql<unknown>`item.name`.as('itemName')])
    .leftJoin('member.register as creator', 'creator.memberId', 'inventory.reservations.createdBy')
    .select([
      sql<string | null>`creator.first_name`.as('createdByFirstName'),
      sql<string | null>`creator.last_name`.as('createdByLastName'),
    ])
    .leftJoin('member.register as updater', 'updater.memberId', 'inventory.reservations.updatedBy')
    .select([
      sql<string | null>`updater.first_name`.as('updatedByFirstName'),
      sql<string | null>`updater.last_name`.as('updatedByLastName'),
    ])
    .leftJoin(
      'member.register as canceller',
      'canceller.memberId',
      'inventory.reservations.cancelledBy',
    )
    .select([
      sql<string | null>`canceller.first_name`.as('cancelledByFirstName'),
      sql<string | null>`canceller.last_name`.as('cancelledByLastName'),
    ])

const mapRow = (row: ReservationRow): ItemReservation => ({
  reservationId: row.reservationId,
  memberId: row.memberId,
  member: {
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    phoneNumber: row.phoneNumber,
  },
  itemId: row.itemId,
  itemName: row.itemName as ItemReservation['itemName'],
  unitId: row.unitId,
  unitTag: row.unitTag,
  unitStatus: row.unitStatus,
  quantity: Number(row.quantity),
  linkedBookingId: row.linkedBookingId,
  status: row.reservationStatus as ItemReservationStatus,
  startTimeEpoch: row.startTimeEpoch,
  startTime: row.startTimeUtc.toISOString(),
  endTimeEpoch: row.endTimeEpoch,
  endTime: row.endTimeUtc.toISOString(),
  description: row.description ?? undefined,
  createdAt: row.createdAt.toISOString(),
  createdBy: row.createdBy,
  createdByName: formatMemberName(row.createdByFirstName, row.createdByLastName),
  updatedAt: row.updatedAt.toISOString(),
  updatedBy: row.updatedBy,
  updatedByName: formatMemberName(row.updatedByFirstName, row.updatedByLastName),
  cancelledAt: row.cancelledAt?.toISOString(),
  cancelledBy: row.cancelledBy,
  cancelledByName: formatMemberName(row.cancelledByFirstName, row.cancelledByLastName),
  cancellationNote: row.cancellationNote ?? undefined,
})

const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value])

export const getReservations = async (
  filters: ItemReservationFilters,
): Promise<ItemReservation[]> => {
  let query = selectReservation()
    .orderBy('startTimeEpoch', 'asc')
    .limit(filters.limit ?? 1000)

  if (filters.reservationId) {
    query = query.where('inventory.reservations.reservationId', '=', filters.reservationId)
  }

  if (filters.itemId) {
    query = query.where('inventory.reservations.itemId', 'in', toArray(filters.itemId))
  }

  if (filters.memberId) {
    query = query.where('inventory.reservations.memberId', '=', filters.memberId)
  }

  if (filters.linkedBookingId) {
    query = query.where('inventory.reservations.linkedBookingId', '=', filters.linkedBookingId)
  }

  if (!filters.showCancelled) {
    query = query.where('reservationStatus', '!=', ItemReservationStatus.CANCELLED)
  }

  if (filters.from) {
    query = query.where('endTimeEpoch', '>=', dayjs(filters.from).unix().toString())
  }

  if (filters.to) {
    query = query.where('startTimeEpoch', '<=', dayjs(filters.to).unix().toString())
  }

  if (filters.excludeReservationId) {
    query = query.where('inventory.reservations.reservationId', '!=', filters.excludeReservationId)
  }

  const rows = await query.execute()
  return rows.map(mapRow)
}

export const getReservationById = async (
  reservationId: string,
): Promise<ItemReservation | undefined> => {
  const row = await selectReservation()
    .where('inventory.reservations.reservationId', '=', reservationId)
    .executeTakeFirst()

  return row ? mapRow(row) : undefined
}

/**
 * Every CONFIRMED reservation riding along with a flight booking.
 *
 * Phase A only reads this — the booking cascade that acts on it belongs to
 * #1140 — but the reservation detail view already needs to know a booking is
 * involved, and the reminder email will.
 */
export const getReservationsByLinkedBookingId = async (
  bookingId: string,
): Promise<ItemReservation[]> =>
  getReservations({ linkedBookingId: bookingId, showCancelled: false })

export const insertReservation = async (
  reservation: ItemReservationUpsertRequest,
  jwt: JWTUser,
): Promise<ItemReservation> => {
  const reservationId = generateShortId()
  const now = new Date()

  await translateCapacityErrors(() =>
    db
      .insertInto('inventory.reservations')
      .values({
        reservationId,
        memberId: reservation.memberId,
        itemId: reservation.itemId,
        unitId: reservation.unitId ?? null,
        quantity: reservation.quantity,
        linkedBookingId: reservation.linkedBookingId ?? null,
        reservationStatus: reservation.status,
        startTimeEpoch: reservation.startTimeEpoch,
        endTimeEpoch: reservation.endTimeEpoch,
        description: reservation.description ?? null,
        ...auditCreate(jwt.memberId, now),
      })
      .execute(),
  )

  return getReservationById(reservationId) as Promise<ItemReservation>
}

/**
 * Patch a reservation. `status` is patchable — moving it to CANCELLED through
 * here is what the calendar's delete does — so the cancellation audit trio is
 * filled in at the same time, the way `updateBooking` does it.
 *
 * A patch moving the status the *other* way has to clear that trio, because
 * `cancelled_audit_check` (V2020) ties it to the status: all three set when
 * CANCELLED, all three NULL when not. Leaving them out would not do it —
 * Kysely drops `undefined` keys from the SET clause entirely, so the columns
 * would keep the values the earlier cancellation wrote and Postgres would
 * reject the update. That exception is not one `CAPACITY_ERRORS` recognises, so
 * it reached the route as an unhandled 500.
 */
export const updateReservation = async (
  reservationId: string,
  patch: Partial<ItemReservationUpsertRequest>,
  jwt: JWTUser,
): Promise<ItemReservation | undefined> => {
  const now = new Date()
  const cancelling = patch.status === ItemReservationStatus.CANCELLED
  const uncancelling = patch.status !== undefined && !cancelling

  const updated = await translateCapacityErrors(() =>
    db
      .updateTable('inventory.reservations')
      .set({
        memberId: patch.memberId,
        itemId: patch.itemId,
        unitId: patch.unitId,
        quantity: patch.quantity,
        linkedBookingId: patch.linkedBookingId,
        reservationStatus: patch.status,
        startTimeEpoch: patch.startTimeEpoch,
        endTimeEpoch: patch.endTimeEpoch,
        description: patch.description,
        ...auditUpdate(jwt.memberId, now),
        cancelledAt: cancelling ? now : uncancelling ? null : undefined,
        cancelledBy: cancelling ? jwt.memberId : uncancelling ? null : undefined,
        // Not covered by the CHECK constraint, but a re-confirmed reservation
        // showing "cancelled because the tank was empty" in the editor's
        // details card would be describing something that no longer happened.
        // The audit table keeps the note either way.
        cancellationNote: uncancelling ? null : undefined,
      })
      .where('reservationId', '=', reservationId)
      .executeTakeFirst(),
  )

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getReservationById(reservationId)
}

export const cancelReservation = async (
  reservationId: string,
  jwt: JWTUser,
  note?: string | null,
): Promise<ItemReservation | undefined> => {
  const updated = await db
    .updateTable('inventory.reservations')
    .set({
      reservationStatus: ItemReservationStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledBy: jwt.memberId,
      cancellationNote: note ?? null,
      ...auditUpdate(jwt.memberId),
    })
    .where('reservationId', '=', reservationId)
    .where('reservationStatus', '!=', ItemReservationStatus.CANCELLED)
    .executeTakeFirst()

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getReservationById(reservationId)
}

/**
 * How many units of an item are already committed in a window — the number the
 * app pre-checks against so a member gets a clean 400 instead of a raw Postgres
 * exception. Advisory only: the trigger decides.
 */
export const getCommittedQuantity = async (
  itemId: string,
  startTimeEpoch: string,
  endTimeEpoch: string,
  excludeReservationId?: string,
): Promise<number> => {
  let query = db
    .selectFrom('inventory.reservations')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('quantity'), sql<string>`0`).as('committed'))
    .where('itemId', '=', itemId)
    .where('reservationStatus', '=', ItemReservationStatus.CONFIRMED)
    .where('startTimeEpoch', '<', endTimeEpoch)
    .where('endTimeEpoch', '>', startTimeEpoch)

  if (excludeReservationId) {
    query = query.where('reservationId', '!=', excludeReservationId)
  }

  const row = await query.executeTakeFirst()
  return Number(row?.committed ?? 0)
}

/**
 * Whether one named unit is already spoken for in a window.
 *
 * `check_reservation_capacity()` runs two checks, not one: a reservation naming
 * a specific unit must not collide with another naming that same unit, *and*
 * still consumes one of the item's units. `getCommittedQuantity` above mirrors
 * the second; this mirrors the first. Without it the friendly pre-check would
 * wave through a clash on "the tank with the full gauge" whenever the pool as a
 * whole still had room, and the member would get the trigger's message about a
 * reservation the pre-check had just called free.
 *
 * Advisory in the same way: the trigger decides, this is what makes the 400 say
 * which of the two rules was broken.
 */
export const hasUnitConflict = async (
  unitId: string,
  startTimeEpoch: string,
  endTimeEpoch: string,
  excludeReservationId?: string,
): Promise<boolean> => {
  let query = db
    .selectFrom('inventory.reservations')
    .select('reservationId')
    .where('unitId', '=', unitId)
    .where('reservationStatus', '=', ItemReservationStatus.CONFIRMED)
    .where('startTimeEpoch', '<', endTimeEpoch)
    .where('endTimeEpoch', '>', startTimeEpoch)
    .limit(1)

  if (excludeReservationId) {
    query = query.where('reservationId', '!=', excludeReservationId)
  }

  return (await query.executeTakeFirst()) !== undefined
}
