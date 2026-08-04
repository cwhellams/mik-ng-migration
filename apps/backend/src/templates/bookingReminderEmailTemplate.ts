import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'
import {
  bookingTemplateLang,
  bookingScheduleHref as href,
  formatBookingRange as formatRange,
} from './bookingEmailHelpers.ts'

export const bookingReminderEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK muistutus tulevasta varauksesta'
    : lang === 'sv'
      ? 'Påminnelse om din kommande MIK-bokning'
      : 'Reminder: Your upcoming MIK booking'

export const bookingReminderEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
): string =>
  markdownEmailTemplate(`booking-reminder-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    calendarLink: generateGoogleCalendarLink(booking),
    href: href(booking),
  })
