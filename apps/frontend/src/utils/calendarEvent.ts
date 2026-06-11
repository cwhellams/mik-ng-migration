import { Booking } from '@backend/routes/bookings/models'

const formatIcsDate = (epoch: string): string => {
  const d = new Date(Number(epoch) * 1000)
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const sanitizeFilenamePart = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, '_')

export const generateGoogleCalendarLink = (booking: Booking): string => {
  const start = formatIcsDate(booking.startTimeEpoch)
  const end = formatIcsDate(booking.endTimeEpoch)
  const text = encodeURIComponent(`MIK - ${booking.registration}`)
  const details = encodeURIComponent(booking.description ?? booking.type)
  const dates = encodeURIComponent(`${start}/${end}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`
}

export const downloadIcs = (booking: Booking): void => {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const summary = escapeIcsText(`MIK - ${booking.registration}`)
  const description = escapeIcsText(booking.description ?? booking.type)
  const sequence = booking.calendarSequence ?? 0

  const ics = [
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
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `booking-${sanitizeFilenamePart(booking.registration)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
