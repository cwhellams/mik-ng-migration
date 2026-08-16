import * as connection from './connection.ts'
import {
  BookingStatus,
  CancellationReason,
  type Booking,
  type BookingFilters,
  type BookingType,
  type BookingUpsertRequest,
  type CancellationRequest,
} from '@mik/contracts/bookings'
import type { CamelRow } from './connection.ts'
import { sql } from 'kysely'
import dayjs from 'dayjs'
import { generateShortId } from '../util/nanoId.ts'
import type { JWTUser } from '../routes/auth/token.ts'

// The booking's own member columns come from a join on member.register; the
// remaining names below are further joins onto the same table for the other roles.
type BookingRow = CamelRow<'schedule.bookings'> &
  Pick<CamelRow<'member.register'>, 'firstName' | 'lastName' | 'phoneNumber'> & {
    instructorFirstName?: string | null
    instructorLastName?: string | null
    instructorPhoneNumber?: string | null
    createdByFirstName?: string | null
    createdByLastName?: string | null
    updatedByFirstName?: string | null
    updatedByLastName?: string | null
    cancelledByFirstName?: string | null
    cancelledByLastName?: string | null
  }

const formatMemberName = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | undefined =>
  firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : undefined

const mapResultToBooking = (row: BookingRow): Booking => ({
  bookingId: row.bookingId,
  memberId: row.memberId,
  member: {
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber,
  },
  instructorMemberId: row.instructorMemberId ?? undefined,
  instructor: row.instructorMemberId
    ? {
        firstName: row.instructorFirstName ?? undefined,
        lastName: row.instructorLastName ?? undefined,
        phoneNumber: row.instructorPhoneNumber ?? null,
      }
    : undefined,
  registration: row.registration,
  status: row.bookingStatus as BookingStatus,
  type: row.bookingType as BookingType,
  description: row.description ?? undefined,
  calendarSequence: Number(row.calendarSequence ?? 0),
  startTimeEpoch: row.startTimeEpoch,
  startTime: row.startTimeUtc.toISOString(),
  endTimeEpoch: row.endTimeEpoch,
  endTime: row.endTimeUtc.toISOString(),
  createdAt: row.createdAt.toISOString(),
  createdBy: row.createdBy,
  createdByName: formatMemberName(row.createdByFirstName, row.createdByLastName),
  updatedAt: row.updatedAt.toISOString(),
  updatedBy: row.updatedBy,
  updatedByName: formatMemberName(row.updatedByFirstName, row.updatedByLastName),
  cancelledAt: row.cancelledAt?.toISOString(),
  cancelledBy: row.cancelledBy,
  cancelledByName: formatMemberName(row.cancelledByFirstName, row.cancelledByLastName),
  cancellationReason: (row.cancellationReason as CancellationReason) ?? undefined,
  cancellationNote: row.cancellationNote ?? undefined,
})

const toArray = <T>(value: T | T[]): T[] => {
  return Array.isArray(value) ? value : [value]
}

export const getBookings = async (filters: BookingFilters): Promise<Booking[]> => {
  let query = connection.camelDb
    .selectFrom('schedule.bookings')
    .selectAll(['schedule.bookings'])
    .innerJoin('member.register', 'schedule.bookings.memberId', 'member.register.memberId')
    .select([
      'member.register.firstName',
      'member.register.lastName',
      'member.register.phoneNumber',
    ])
    .leftJoin('member.register as instr', 'instr.memberId', 'schedule.bookings.instructorMemberId')
    .select([
      sql<string | null>`instr.first_name`.as('instructorFirstName'),
      sql<string | null>`instr.last_name`.as('instructorLastName'),
      sql<string | null>`instr.phone_number`.as('instructorPhoneNumber'),
    ])
    .leftJoin('member.register as creator', 'creator.memberId', 'schedule.bookings.createdBy')
    .select([
      sql<string | null>`creator.first_name`.as('createdByFirstName'),
      sql<string | null>`creator.last_name`.as('createdByLastName'),
    ])
    .leftJoin('member.register as updater', 'updater.memberId', 'schedule.bookings.updatedBy')
    .select([
      sql<string | null>`updater.first_name`.as('updatedByFirstName'),
      sql<string | null>`updater.last_name`.as('updatedByLastName'),
    ])
    .leftJoin('member.register as canceller', 'canceller.memberId', 'schedule.bookings.cancelledBy')
    .select([
      sql<string | null>`canceller.first_name`.as('cancelledByFirstName'),
      sql<string | null>`canceller.last_name`.as('cancelledByLastName'),
    ])
    .orderBy('startTimeEpoch', filters.orderLatestFirst ? 'desc' : 'asc')
    .limit(filters.limit ?? 1000)

  if (filters['registration']) {
    query = query.where('registration', 'in', toArray(filters['registration']))
  }

  if (filters['memberId']) {
    query = query.where('schedule.bookings.memberId', '=', filters['memberId'])
  }

  if (!filters['showCancelled']) {
    query = query.where('bookingStatus', '!=', BookingStatus.CANCELLED)
  }

  if (filters.from) {
    query = query.where(
      'endTimeEpoch',
      filters.exclusiveStartEnd ? '>' : '>=',
      dayjs(filters.from).unix().toString(),
    )
  }

  if (filters.to) {
    query = query.where(
      'startTimeEpoch',
      filters.exclusiveStartEnd ? '<' : '<=',
      dayjs(filters.to).unix().toString(),
    )
  }

  if (filters.excludeBookingId) {
    query = query.where('bookingId', '!=', filters.excludeBookingId)
  }

  const results = await query.execute()
  return results.map(mapResultToBooking)
}

export const getBookingById = async (bookingId: string): Promise<Booking | undefined> => {
  let booking = await connection.camelDb
    .selectFrom('schedule.bookings')
    .selectAll('schedule.bookings')
    .innerJoin('member.register', 'schedule.bookings.memberId', 'member.register.memberId')
    .select([
      'member.register.firstName',
      'member.register.lastName',
      'member.register.phoneNumber',
    ])
    .leftJoin('member.register as instr', 'instr.memberId', 'schedule.bookings.instructorMemberId')
    .select([
      sql<string | null>`instr.first_name`.as('instructorFirstName'),
      sql<string | null>`instr.last_name`.as('instructorLastName'),
      sql<string | null>`instr.phone_number`.as('instructorPhoneNumber'),
    ])
    .leftJoin('member.register as creator', 'creator.memberId', 'schedule.bookings.createdBy')
    .select([
      sql<string | null>`creator.first_name`.as('createdByFirstName'),
      sql<string | null>`creator.last_name`.as('createdByLastName'),
    ])
    .leftJoin('member.register as updater', 'updater.memberId', 'schedule.bookings.updatedBy')
    .select([
      sql<string | null>`updater.first_name`.as('updatedByFirstName'),
      sql<string | null>`updater.last_name`.as('updatedByLastName'),
    ])
    .leftJoin('member.register as canceller', 'canceller.memberId', 'schedule.bookings.cancelledBy')
    .select([
      sql<string | null>`canceller.first_name`.as('cancelledByFirstName'),
      sql<string | null>`canceller.last_name`.as('cancelledByLastName'),
    ])
    .where('bookingId', '=', bookingId)
    .executeTakeFirst()

  if (!booking) {
    return undefined
  }

  return mapResultToBooking(booking)
}

export const insertBooking = async (
  booking: BookingUpsertRequest,
  jwt: JWTUser,
): Promise<Booking> => {
  const now = new Date().toISOString()

  const newBooking = await connection.camelDb
    .insertInto('schedule.bookings')
    .values({
      bookingId: generateShortId(),
      memberId: booking.memberId,
      registration: booking.registration,
      bookingStatus: booking.status,
      bookingType: booking.type,
      description: booking.description,
      startTimeEpoch: booking.startTimeEpoch,
      endTimeEpoch: booking.endTimeEpoch,
      instructorMemberId: booking.instructorMemberId ?? null,
      createdBy: jwt.memberId,
      createdAt: now,
      updatedBy: jwt.memberId,
      updatedAt: now,
    })
    .returning(['bookingId', 'startTimeUtc', 'endTimeUtc'])
    .executeTakeFirstOrThrow()

  return {
    ...booking,
    member: {
      firstName: '',
      lastName: '',
      phoneNumber: null,
    },
    instructor: undefined,
    bookingId: newBooking.bookingId,
    calendarSequence: 0,
    startTime: newBooking.startTimeUtc.toISOString(),
    endTime: newBooking.endTimeUtc.toISOString(),
    createdAt: now,
    createdBy: jwt.memberId,
    updatedAt: now,
    updatedBy: jwt.memberId,
  }
}

export const updateBooking = async (
  bookingId: string,
  patch: Partial<Booking>,
  jwt: JWTUser,
): Promise<Booking | undefined> => {
  const now = new Date().toISOString()
  const updated = await connection.camelDb
    .updateTable('schedule.bookings')
    .set({
      registration: patch.registration,
      bookingStatus: patch.status,
      bookingType: patch.type,
      description: patch.description,
      startTimeEpoch: patch.startTimeEpoch,
      endTimeEpoch: patch.endTimeEpoch,
      memberId: patch.memberId,
      instructorMemberId: patch.instructorMemberId,
      updatedAt: now,
      updatedBy: jwt.memberId,
      cancelledAt: patch.status === BookingStatus.CANCELLED ? now : undefined,
      cancelledBy: patch.status === BookingStatus.CANCELLED ? jwt.memberId : undefined,
      calendarSequence: sql`calendar_sequence + 1`,
    })
    .where('bookingId', '=', bookingId)
    .executeTakeFirst()

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getBookingById(bookingId)
}

export const cancelBooking = async (
  bookingId: string,
  jwt: JWTUser,
  cancellation?: CancellationRequest,
): Promise<Booking | undefined> => {
  const updated = await connection.camelDb
    .updateTable('schedule.bookings')
    .set({
      bookingStatus: BookingStatus.CANCELLED,
      cancelledAt: new Date().toISOString(),
      cancelledBy: jwt.memberId,
      cancellationReason: cancellation?.reason ?? null,
      cancellationNote: cancellation?.note ?? null,
      calendarSequence: sql`calendar_sequence + 1`,
    })
    .where('bookingId', '=', bookingId)
    .executeTakeFirst()

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getBookingById(bookingId)
}

/**
 * Atomically claim upcoming bookings that need a reminder email.
 * Uses UPDATE...WHERE reminder_sent_at IS NULL...RETURNING to ensure only one
 * worker instance can process each booking, even in multi-instance deployments.
 *
 * Claims bookings with CONFIRMED or TENTATIVE status where start_time_epoch
 * is within a ±1h window around `hoursBeforeBooking` hours from now (to handle
 * hourly cron timing variance) and no reminder has been claimed yet.
 *
 * @param hoursBeforeBooking - How many hours before the booking to send the reminder (default: 24)
 *
 * Returns the claimed bookings with full member info for email sending.
 */
export const claimUpcomingBookingsForReminder = async (
  hoursBeforeBooking: number = 24,
): Promise<Booking[]> => {
  const windowStart = dayjs()
    .add(hoursBeforeBooking - 1, 'hour')
    .unix()
    .toString()
  const windowEnd = dayjs()
    .add(hoursBeforeBooking + 1, 'hour')
    .unix()
    .toString()
  const now = new Date().toISOString()

  // Atomically claim bookings by setting reminder_sent_at in a single UPDATE.
  // Because this UPDATE is atomic, concurrent worker instances will each claim
  // a disjoint set of rows (only rows still NULL are updated).
  const claimed = await connection.camelDb
    .updateTable('schedule.bookings')
    .set({ reminderSentAt: now })
    .where('startTimeEpoch', '>=', windowStart)
    .where('startTimeEpoch', '<=', windowEnd)
    .where((eb) =>
      eb.or([
        eb('bookingStatus', '=', BookingStatus.CONFIRMED),
        eb('bookingStatus', '=', BookingStatus.TENTATIVE),
      ]),
    )
    .where('reminderSentAt', 'is', null)
    .returning(['bookingId'])
    .execute()

  if (claimed.length === 0) {
    return []
  }

  // Fetch full booking data (including member info) for the claimed booking IDs
  const claimedIds = claimed.map((r) => r.bookingId)
  const results = await connection.camelDb
    .selectFrom('schedule.bookings')
    .selectAll(['schedule.bookings'])
    .innerJoin('member.register', 'schedule.bookings.memberId', 'member.register.memberId')
    .select([
      'member.register.firstName',
      'member.register.lastName',
      'member.register.phoneNumber',
    ])
    .leftJoin('member.register as instr', 'instr.memberId', 'schedule.bookings.instructorMemberId')
    .select([
      sql<string | null>`instr.first_name`.as('instructorFirstName'),
      sql<string | null>`instr.last_name`.as('instructorLastName'),
      sql<string | null>`instr.phone_number`.as('instructorPhoneNumber'),
    ])
    .leftJoin('member.register as creator', 'creator.memberId', 'schedule.bookings.createdBy')
    .select([
      sql<string | null>`creator.first_name`.as('createdByFirstName'),
      sql<string | null>`creator.last_name`.as('createdByLastName'),
    ])
    .leftJoin('member.register as updater', 'updater.memberId', 'schedule.bookings.updatedBy')
    .select([
      sql<string | null>`updater.first_name`.as('updatedByFirstName'),
      sql<string | null>`updater.last_name`.as('updatedByLastName'),
    ])
    .leftJoin('member.register as canceller', 'canceller.memberId', 'schedule.bookings.cancelledBy')
    .select([
      sql<string | null>`canceller.first_name`.as('cancelledByFirstName'),
      sql<string | null>`canceller.last_name`.as('cancelledByLastName'),
    ])
    .where('schedule.bookings.bookingId', 'in', claimedIds)
    .execute()

  return results.map(mapResultToBooking)
}

/**
 * Cancel all future bookings for a member
 * Cancels bookings with status TENTATIVE or CONFIRMED where start_time_epoch >= current epoch
 */
export const cancelAllFutureBookingsForMember = async (
  memberId: string,
  description: string,
  cancelledBy: string = 'k1mnimda',
): Promise<number> => {
  const now = new Date()
  const currentEpoch = dayjs().unix().toString()

  const result = await connection.camelDb
    .updateTable('schedule.bookings')
    .set({
      bookingStatus: BookingStatus.CANCELLED,
      description: description,
      updatedAt: now.toISOString(),
      updatedBy: cancelledBy,
      cancelledAt: now.toISOString(),
      cancelledBy: cancelledBy,
    })
    .where('memberId', '=', memberId)
    .where('startTimeEpoch', '>=', currentEpoch)
    .where((eb) =>
      eb.or([
        eb('bookingStatus', '=', BookingStatus.TENTATIVE),
        eb('bookingStatus', '=', BookingStatus.CONFIRMED),
      ]),
    )
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}
