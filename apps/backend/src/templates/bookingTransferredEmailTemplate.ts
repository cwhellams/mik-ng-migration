import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { epochToLocal } from '../util/date.ts'
import { generateGoogleCalendarLink } from '../lib/calendarEvent.ts'

export const bookingTransferredFromEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'MIK varauksesi on siirretty toiselle jäsenelle'
    : lang === 'sv'
      ? 'Din MIK-bokning har överförts till en annan medlem'
      : 'Your MIK booking has been transferred to another member'

export const bookingTransferredToEmailSubject = (lang: string | undefined): string =>
  lang === 'fi'
    ? 'Sinulle on siirretty MIK-varaus'
    : lang === 'sv'
      ? 'En MIK-bokning har överförts till dig'
      : 'A MIK booking has been transferred to you'

const bookingTemplateLang = (lang: string | undefined): 'en' | 'fi' | 'sv' =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

export const bookingTransferredFromEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
  newMemberName: string,
): string =>
  markdownEmailTemplate(`booking-transferred-from-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    newMemberName,
    href: href(booking),
  })

export const bookingTransferredToEmailBodyHtml = (
  lang: string | undefined,
  firstName: string,
  booking: Booking,
  previousMemberName: string,
): string =>
  markdownEmailTemplate(`booking-transferred-to-${bookingTemplateLang(lang)}.md`, {
    firstName,
    registration: booking.registration,
    bookingTime: formatRange(booking),
    previousMemberName,
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
