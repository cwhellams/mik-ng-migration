import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'
import {
  bookingTemplateLang,
  bookingScheduleHref as href,
  formatBookingRange as formatRange,
} from './bookingEmailHelpers.ts'

export const bookingConfirmedEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK varauksesi on vahvistettu'
    : lang === 'sv'
      ? 'Din MIK-bokning är bekräftad'
      : 'Your MIK booking is confirmed'

export const bookingUpdatedEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK varauksesi on päivitetty'
    : lang === 'sv'
      ? 'Din MIK-bokning har uppdaterats'
      : 'Your MIK booking has been updated'

export const bookingConfirmedEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
): string =>
  markdownEmailTemplate(`booking-confirmed-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    calendarLink: generateGoogleCalendarLink(booking),
    href: href(booking),
  })

export const bookingUpdatedEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
): string =>
  markdownEmailTemplate(`booking-updated-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    calendarLink: generateGoogleCalendarLink(booking),
    href: href(booking),
  })
