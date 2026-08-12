import 'dotenv/config'
import type { Booking } from '@mik/contracts/bookings'
import { buildBookingIcs } from '@mik/contracts/calendar'

// Thin wrappers over the shared builder in @mik/contracts/calendar. They exist only
// to supply the ORGANIZER address, which comes from the environment and so cannot
// live in a package the browser also loads.
const organizerEmail = (): string => process.env.SMTP_LOGIN ?? 'noreply@mik.fi'

export const generateIcsContent = (booking: Booking, attendeeEmail?: string): string =>
  buildBookingIcs(booking, {
    method: 'REQUEST',
    organizerEmail: organizerEmail(),
    attendeeEmail,
  })

export const generateCancelIcsContent = (booking: Booking): string =>
  buildBookingIcs(booking, { method: 'CANCEL', organizerEmail: organizerEmail() })
