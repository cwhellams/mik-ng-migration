import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { epochToLocal } from '../util/date.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'

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

const bookingTemplateLang = (lang: string | undefined): 'en' | 'fi' | 'sv' =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

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

const href = (booking: Booking) =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

const formatRange = (booking: Booking) =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`
