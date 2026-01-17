import 'dotenv/config'
import type { BookingUpsertRequest } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { epochToLocal } from '../util/date.ts'
import { escapeHtml } from '../util/sanitizers.ts'

export const bookingCancelledEmailSubject = (lang: string | undefined): string =>
  lang == 'fi' ? 'MIK varauksesi peruttu' : 'Your booking is cancelled'

export const bookingCancelledEmailBodyHtml = (
  lang: string | undefined,
  by: string,
  oldBooking: BookingUpsertRequest,
  newBooking: BookingUpsertRequest,
): string =>
  markdownEmailTemplate(`booking-cancelled-${lang}.md`, {
    ...oldBooking,
    oldBookingTime: formatRange(oldBooking),
    newBookingTime: formatRange(newBooking),
    reason: escapeHtml(newBooking.description ?? newBooking.type),
    by: escapeHtml(by),
    href: href(oldBooking),
  })

const href = (booking: BookingUpsertRequest) =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

const formatRange = (booking: BookingUpsertRequest) =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`
