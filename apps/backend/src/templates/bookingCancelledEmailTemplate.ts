import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'
import { markdownEmailTemplate } from './emailTemplate.ts'
import { epochToLocal } from '../util/date.ts'

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

const bookingTemplateLang = (lang: string | undefined): 'en' | 'fi' | 'sv' =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

const href = (booking: Booking) =>
  `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/schedule?day=${epochToLocal(
    booking.startTimeEpoch,
  ).format('YYYY-MM-DD')}`

const formatRange = (booking: Booking) =>
  `${epochToLocal(booking.startTimeEpoch).format('DD.MM. HH:mm')} - ${epochToLocal(
    booking.endTimeEpoch,
  ).format('DD.MM. HH:mm')}`
