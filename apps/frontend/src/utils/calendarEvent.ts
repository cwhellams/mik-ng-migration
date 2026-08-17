import type { Booking } from '@mik/contracts/bookings'
import { buildBookingIcs } from '@mik/contracts/calendar'

import { sanitizeFilenamePart, saveIcsFile } from './icsDownload'

// The ICS body itself is built by @mik/contracts/calendar, shared with the backend's
// mailed invites, and the download by ./icsDownload, shared with the club-event
// export. No ORGANIZER: this file is saved by the member, not sent on the club's
// behalf.
export const downloadIcs = (booking: Booking): void =>
  saveIcsFile(
    buildBookingIcs(booking, { method: 'REQUEST' }),
    `booking-${sanitizeFilenamePart(booking.registration)}.ics`,
  )
