import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { epochToLocal } from '../util/date.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'

export const bookingReminderEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK muistutus tulevasta varauksesta'
    : lang === 'sv'
      ? 'Påminnelse om din kommande MIK-bokning'
      : 'Reminder: Your upcoming MIK booking'

const bookingTemplateLang = (lang: string | undefined): 'en' | 'fi' | 'sv' =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

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

const href = (booking: Booking) =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

const formatRange = (booking: Booking) =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`
