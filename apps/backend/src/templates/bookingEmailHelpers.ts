import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { epochToLocal } from '../util/date.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'

// Shared across all booking-related email templates (confirmed, updated,
// cancelled, transferred, reminder, instructor notifications).
export const bookingScheduleHref = (booking: Booking): string =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

export const formatBookingRange = (booking: Booking): string =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`

/**
 * The vars every `booking-*.md` template draws on, plus whatever the specific
 * email adds (`firstName`, `studentName`, `newMemberName`, …).
 *
 * `extra` is generic so those additions survive into the return type and
 * `renderEmail()` can still check them against the template's declared vars.
 *
 * `calendarLink` is included for all of them even though the cancellation
 * templates don't render it — an unreferenced Handlebars var is inert, and one
 * shape for every booking email beats six near-identical literals.
 */
export const bookingEmailVars = <Extra extends Record<string, unknown>>(
  booking: Booking,
  extra: Extra,
) => ({
  registration: booking.registration,
  bookingTime: formatBookingRange(booking),
  calendarLink: generateGoogleCalendarLink(booking),
  href: bookingScheduleHref(booking),
  ...extra,
})
