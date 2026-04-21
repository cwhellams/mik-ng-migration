import 'dotenv/config'
import type { Booking } from '../routes/bookings/models.ts'

const formatIcsDate = (epoch: string): string => {
  const d = new Date(Number(epoch) * 1000)
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const organizerEmail = (): string => process.env.SMTP_LOGIN ?? 'noreply@mik.fi'

export const generateIcsContent = (booking: Booking, attendeeEmail?: string): string => {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const summary = escapeIcsText(`MIK - ${booking.registration}`)
  const description = escapeIcsText(booking.description ?? booking.type)
  const sequence = booking.calendarSequence ?? 0
  const organizer = organizerEmail()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:booking-${booking.bookingId}@mik.fi`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(booking.startTimeEpoch)}`,
    `DTEND:${formatIcsDate(booking.endTimeEpoch)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `SEQUENCE:${sequence}`,
    `ORGANIZER:mailto:${organizer}`,
  ]

  if (attendeeEmail) {
    lines.push(`ATTENDEE;RSVP=FALSE:mailto:${attendeeEmail}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export const generateCancelIcsContent = (booking: Booking): string => {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const summary = escapeIcsText(`MIK - ${booking.registration}`)
  const sequence = booking.calendarSequence ?? 0
  const organizer = organizerEmail()

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
    'METHOD:CANCEL',
    'BEGIN:VEVENT',
    `UID:booking-${booking.bookingId}@mik.fi`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(booking.startTimeEpoch)}`,
    `DTEND:${formatIcsDate(booking.endTimeEpoch)}`,
    `SUMMARY:${summary}`,
    `SEQUENCE:${sequence}`,
    `ORGANIZER:mailto:${organizer}`,
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export const generateGoogleCalendarLink = (booking: Booking): string => {
  const start = formatIcsDate(booking.startTimeEpoch)
  const end = formatIcsDate(booking.endTimeEpoch)
  const text = encodeURIComponent(`MIK - ${booking.registration}`)
  const details = encodeURIComponent(booking.description ?? booking.type)
  const dates = encodeURIComponent(`${start}/${end}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`
}
