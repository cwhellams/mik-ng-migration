import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { epochToLocal } from '../util/date.ts'

// Shared across all booking-related email templates (confirmed, updated,
// cancelled, transferred, reminder, instructor notifications).
export const bookingTemplateLang = (lang: string | undefined): 'en' | 'fi' | 'sv' =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

export const bookingScheduleHref = (booking: Booking): string =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

export const formatBookingRange = (booking: Booking): string =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`
