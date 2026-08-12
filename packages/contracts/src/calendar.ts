import type { Booking } from './bookings.ts'

// Both apps used to build this VCALENDAR themselves — same PRODID, same UID
// scheme, same field order, byte-identical formatIcsDate/escapeIcsText — so any
// change to one silently drifted from the other (issue #1115, finding 8). The
// server-only parts (ORGANIZER, ATTENDEE) are arguments rather than env reads,
// because this module is also loaded by the browser.

const formatIcsDate = (epoch: string): string => {
  const d = new Date(Number(epoch) * 1000)
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export interface BookingIcsOptions {
  /** REQUEST creates or updates the event in the invitee's calendar, CANCEL withdraws it. */
  method: 'REQUEST' | 'CANCEL'
  /** ORGANIZER address. Server-side only — the browser download has no organiser. */
  organizerEmail?: string
  /** ATTENDEE address, for the invite mailed to a specific member. */
  attendeeEmail?: string
}

export const buildBookingIcs = (
  booking: Booking,
  { method, organizerEmail, attendeeEmail }: BookingIcsOptions,
): string => {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:booking-${booking.bookingId}@mik.fi`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(booking.startTimeEpoch)}`,
    `DTEND:${formatIcsDate(booking.endTimeEpoch)}`,
    `SUMMARY:${escapeIcsText(`MIK - ${booking.registration}`)}`,
  ]

  // A cancellation carries no DESCRIPTION — the event is being withdrawn, and
  // both hand-written copies deliberately left it out.
  if (method !== 'CANCEL') {
    lines.push(`DESCRIPTION:${escapeIcsText(booking.description ?? booking.type)}`)
  }

  lines.push(`SEQUENCE:${booking.calendarSequence ?? 0}`)

  if (organizerEmail) {
    lines.push(`ORGANIZER:mailto:${organizerEmail}`)
  }
  if (attendeeEmail) {
    lines.push(`ATTENDEE;RSVP=FALSE:mailto:${attendeeEmail}`)
  }
  if (method === 'CANCEL') {
    lines.push('STATUS:CANCELLED')
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export const generateGoogleCalendarLink = (booking: Booking): string => {
  const start = formatIcsDate(booking.startTimeEpoch)
  const end = formatIcsDate(booking.endTimeEpoch)
  const text = encodeURIComponent(`MIK - ${booking.registration}`)
  const details = encodeURIComponent(booking.description ?? booking.type)
  const dates = encodeURIComponent(`${start}/${end}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`
}
