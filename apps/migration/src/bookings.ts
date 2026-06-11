import { conn } from './services/db.ts'
import {
  BookingStatus,
  BookingType,
  type BookingUpsertRequest,
} from '../../backend/src/routes/bookings/models.ts'
import { request } from './services/api.ts'
import type {
  MemberListFilters,
  MemberListResponse,
} from '../../backend/src/routes/members/models.ts'

type Booking = {
  id: number
  start_time: number
  end_time: number
  room_id: number
  timestamp: Date
  create_by: string
  modified_by: string
  name: string
  type: string
  description: string
  status: number
  room_name: string
  memberId: string
}

export const migrateBookings = async (start: string, limit: number) => {
  const bookings = await conn.query<Booking[]>(`
    SELECT b.*,r.room_name,u.ng_id as memberId
    FROM mikweb2_mrbs_entry b
    JOIN mikweb2_mrbs_room r ON r.room_name in ('OH-SRH', 'OH-STL', 'OH-IHQ', 'OH-PJH') and b.room_id = r.id
    LEFT JOIN mik_ng u on u.username COLLATE utf8mb4_unicode_ci = b.create_by
    WHERE b.start_time > UNIX_TIMESTAMP("${start}")
    AND b.entry_type = 0
    ORDER BY b.start_time ASC
    LIMIT ${limit}
  `)

  const currentMembers = await request<MemberListFilters, MemberListResponse>('GET', `v1/members`)

  const removedMembers = await request<MemberListFilters, MemberListResponse>(
    'GET',
    `v1/members?showRemoved=true`,
  )

  const members = [...(currentMembers?.members ?? []), ...(removedMembers?.members ?? [])]

  for (const booking of bookings) {
    const member = members.find((m) => m.memberId === booking.memberId)
    if (!member) {
      console.log(`Skipping booking ID ${booking.id} by unknown member ${booking.create_by}`)
      //console.log(booking)
      continue
    }
    if (booking.start_time > booking.end_time) {
      console.log(`Skipping booking ID ${booking.id} because start time is after end time`)
      //console.log(booking)
      continue
    }

    const time = new Date(booking.start_time * 1000).toISOString()

    const schedule: BookingUpsertRequest = {
      memberId: member.memberId,
      registration: booking.room_name,
      description: mapDescription(booking.type, booking.description),
      startTimeEpoch: booking.start_time.toString(),
      endTimeEpoch: booking.end_time.toString(),
      type: mapBookingType(booking.type),
      status: mapStatus(booking.status),
    }
    try {
      await request('POST', 'v1/bookings', schedule)
      console.log(`${booking.id}, at ${time}`)
    } catch (e) {
      console.log(`Error migrating booking ${booking.id}, stopping migration to timestamp ${time}`)
      console.log(schedule)
      console.log(booking)
      throw e
    }
  }

  const last = bookings[bookings.length - 1]
  const time = new Date(last.start_time * 1000).toISOString()
  console.log(`Migrated up to booking ID ${last?.id} at ${time}`)
}

const mapDescription = (type: string, description: string): string => {
  switch (type) {
    case 'E':
      return `AEROBATIC: ${description}`
    case 'F':
      return `SAR: ${description}`
    default:
      return description
  }
}

const mapBookingType = (type: string): BookingType => {
  switch (type) {
    case 'A':
      return BookingType.PRIVATE
    case 'B':
      return BookingType.PRIVATE
    case 'C':
      return BookingType.TRAINING
    case 'D':
      return BookingType.MAINTENANCE
    default:
      return BookingType.PRIVATE
  }
}

const mapStatus = (status: number): BookingStatus => {
  switch (status) {
    case 4:
      return BookingStatus.TENTATIVE
    default:
      return BookingStatus.CONFIRMED
  }
}
