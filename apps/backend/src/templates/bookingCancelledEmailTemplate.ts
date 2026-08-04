import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import {
  bookingTemplateLang,
  bookingScheduleHref as href,
  formatBookingRange as formatRange,
} from './bookingEmailHelpers.ts'

export const bookingCancelledEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK varauksesi on peruttu'
    : lang === 'sv'
      ? 'Din MIK-bokning har blivit inställd'
      : 'Your MIK booking is cancelled'

export const bookingCancelledEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
): string =>
  markdownEmailTemplate(`booking-cancelled-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    href: href(booking),
  })
