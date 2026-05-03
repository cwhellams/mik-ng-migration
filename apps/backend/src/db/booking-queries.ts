import * as connection from './connection.ts'
import {
  BookingStatus,
  type Booking,
  type BookingFilters,
  type BookingType,
  type BookingUpsertRequest,
} from '../routes/bookings/models.ts'
import type { MemberRegister, ScheduleBookings } from './schema.js'
import type { Selectable } from 'kysely'
import { sql } from 'kysely'
import dayjs from 'dayjs'
import { generateShortId } from '../util/nanoId.ts'
import type { JWTUser } from '../routes/auth/token.ts'

type BookingRow = Selectable<
  ScheduleBookings & Pick<MemberRegister, 'first_name' | 'last_name' | 'phone_number'>
> & {
  instructor_first_name?: string | null
  instructor_last_name?: string | null
  instructor_phone_number?: string | null
}

const mapResultToBooking = (row: BookingRow): Booking => ({
  bookingId: row.booking_id,
  memberId: row.member_id,
  member: {
    firstName: row.first_name,
    lastName: row.last_name,
    phoneNumber: row.phone_number,
  },
  instructorMemberId: row.instructor_member_id ?? undefined,
  instructor: row.instructor_member_id
    ? {
        firstName: row.instructor_first_name ?? undefined,
        lastName: row.instructor_last_name ?? undefined,
        phoneNumber: row.instructor_phone_number ?? null,
      }
    : undefined,
  registration: row.registration,
  status: row.booking_status as BookingStatus,
  type: row.booking_type as BookingType,
  description: row.description ?? undefined,
  calendarSequence: Number(row.calendar_sequence ?? 0),
  startTimeEpoch: row.start_time_epoch,
  startTime: row.start_time_utc.toISOString(),
  endTimeEpoch: row.end_time_epoch,
  endTime: row.end_time_utc.toISOString(),
  createdAt: row.created_at.toISOString(),
  createdBy: row.created_by,
  updatedAt: row.updated_at.toISOString(),
  updatedBy: row.updated_by,
  cancelledAt: row.cancelled_at?.toISOString(),
  cancelledBy: row.cancelled_by,
})

const toArray = <T>(value: T | T[]): T[] => {
  return Array.isArray(value) ? value : [value]
}

export const getBookings = async (filters: BookingFilters): Promise<Booking[]> => {
  let query = connection.db
    .selectFrom('schedule.bookings')
    .selectAll(['schedule.bookings'])
    .innerJoin('member.register', 'schedule.bookings.member_id', 'member.register.member_id')
    .select([
      'member.register.first_name',
      'member.register.last_name',
      'member.register.phone_number',
    ])
    .leftJoin(
      'member.register as instr',
      'instr.member_id',
      'schedule.bookings.instructor_member_id',
    )
    .select([
      sql<string | null>`instr.first_name`.as('instructor_first_name'),
      sql<string | null>`instr.last_name`.as('instructor_last_name'),
      sql<string | null>`instr.phone_number`.as('instructor_phone_number'),
    ])
    .orderBy('start_time_epoch', filters.orderLatestFirst ? 'desc' : 'asc')
    .limit(filters.limit ?? 1000)

  if (filters['registration[]']) {
    query = query.where('registration', 'in', toArray(filters['registration[]']))
  }

  if (filters['memberId']) {
    query = query.where('schedule.bookings.member_id', '=', filters['memberId'])
  }

  if (!filters['showCancelled']) {
    query = query.where('booking_status', '!=', BookingStatus.CANCELLED)
  }

  if (filters.from) {
    query = query.where(
      'end_time_epoch',
      filters.exclusiveStartEnd ? '>' : '>=',
      dayjs(filters.from).unix().toString(),
    )
  }

  if (filters.to) {
    query = query.where(
      'start_time_epoch',
      filters.exclusiveStartEnd ? '<' : '<=',
      dayjs(filters.to).unix().toString(),
    )
  }

  if (filters.excludeBookingId) {
    query = query.where('booking_id', '!=', filters.excludeBookingId)
  }

  const results = await query.execute()
  return results.map(mapResultToBooking)
}

export const getBookingById = async (bookingId: string): Promise<Booking | undefined> => {
  let booking = await connection.db
    .selectFrom('schedule.bookings')
    .selectAll('schedule.bookings')
    .innerJoin('member.register', 'schedule.bookings.member_id', 'member.register.member_id')
    .select([
      'member.register.first_name',
      'member.register.last_name',
      'member.register.phone_number',
    ])
    .leftJoin(
      'member.register as instr',
      'instr.member_id',
      'schedule.bookings.instructor_member_id',
    )
    .select([
      sql<string | null>`instr.first_name`.as('instructor_first_name'),
      sql<string | null>`instr.last_name`.as('instructor_last_name'),
      sql<string | null>`instr.phone_number`.as('instructor_phone_number'),
    ])
    .where('booking_id', '=', bookingId)
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

  const newBooking = await connection.db
    .insertInto('schedule.bookings')
    .values({
      booking_id: generateShortId(),
      member_id: booking.memberId,
      registration: booking.registration,
      booking_status: booking.status,
      booking_type: booking.type,
      description: booking.description,
      start_time_epoch: booking.startTimeEpoch,
      end_time_epoch: booking.endTimeEpoch,
      instructor_member_id: booking.instructorMemberId ?? null,
      created_by: jwt.memberId,
      created_at: now,
      updated_by: jwt.memberId,
      updated_at: now,
    })
    .returning(['booking_id', 'start_time_utc', 'end_time_utc'])
    .executeTakeFirstOrThrow()

  return {
    ...booking,
    member: {
      firstName: '',
      lastName: '',
      phoneNumber: null,
    },
    instructor: undefined,
    bookingId: newBooking.booking_id,
    calendarSequence: 0,
    startTime: newBooking.start_time_utc.toISOString(),
    endTime: newBooking.end_time_utc.toISOString(),
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
  const updated = await connection.db
    .updateTable('schedule.bookings')
    .set({
      registration: patch.registration,
      booking_status: patch.status,
      booking_type: patch.type,
      description: patch.description,
      start_time_epoch: patch.startTimeEpoch,
      end_time_epoch: patch.endTimeEpoch,
      member_id: patch.memberId,
      instructor_member_id: patch.instructorMemberId,
      updated_at: now,
      updated_by: jwt.memberId,
      cancelled_at: patch.status === BookingStatus.CANCELLED ? now : undefined,
      cancelled_by: patch.status === BookingStatus.CANCELLED ? jwt.memberId : undefined,
      calendar_sequence: sql`calendar_sequence + 1`,
    })
    .where('booking_id', '=', bookingId)
    .executeTakeFirst()

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getBookingById(bookingId)
}

export const cancelBooking = async (
  bookingId: string,
  jwt: JWTUser,
): Promise<Booking | undefined> => {
  const updated = await connection.db
    .updateTable('schedule.bookings')
    .set({
      booking_status: BookingStatus.CANCELLED,
      cancelled_at: new Date().toISOString(),
      cancelled_by: jwt.memberId,
      calendar_sequence: sql`calendar_sequence + 1`,
    })
    .where('booking_id', '=', bookingId)
    .executeTakeFirst()

  if (!updated.numUpdatedRows) {
    return undefined
  }

  return getBookingById(bookingId)
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

  const result = await connection.db
    .updateTable('schedule.bookings')
    .set({
      booking_status: BookingStatus.CANCELLED,
      description: description,
      updated_at: now.toISOString(),
      updated_by: cancelledBy,
      cancelled_at: now.toISOString(),
      cancelled_by: cancelledBy,
    })
    .where('member_id', '=', memberId)
    .where('start_time_epoch', '>=', currentEpoch)
    .where(eb =>
      eb.or([
        eb('booking_status', '=', BookingStatus.TENTATIVE),
        eb('booking_status', '=', BookingStatus.CONFIRMED),
      ]),
    )
    .executeTakeFirst()

  return Number(result.numUpdatedRows ?? 0)
}
