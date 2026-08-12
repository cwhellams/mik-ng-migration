import type { Booking } from '@mik/contracts/bookings'
import { buildBookingIcs } from '@mik/contracts/calendar'

const sanitizeFilenamePart = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, '_')

// The ICS body itself is built by @mik/contracts/calendar, shared with the backend's
// mailed invites. Only the download is browser-specific, so only the download lives
// here. No ORGANIZER: this file is saved by the member, not sent on the club's behalf.
export const downloadIcs = (booking: Booking): void => {
  const ics = buildBookingIcs(booking, { method: 'REQUEST' })

  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `booking-${sanitizeFilenamePart(booking.registration)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
