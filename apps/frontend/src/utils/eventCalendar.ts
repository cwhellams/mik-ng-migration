import type { ClubEvent } from '@mik/contracts/events'

const formatIcsDate = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

const escapeIcsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const sanitizeFilenamePart = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, '_')

export const generateEventGoogleCalendarLink = (event: ClubEvent): string => {
  const start = formatIcsDate(event.startTime)
  const end = formatIcsDate(event.endTime)
  const text = encodeURIComponent(`MIK – ${event.title}`)
  const details = encodeURIComponent(event.description ?? '')
  const location = encodeURIComponent(event.location ?? '')
  const dates = encodeURIComponent(`${start}/${end}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`
}

export const downloadEventIcs = (event: ClubEvent): void => {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const summary = escapeIcsText(`MIK – ${event.title}`)
  const description = escapeIcsText(event.description ?? '')
  const location = escapeIcsText(event.location ?? '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.eventId}@mik.fi`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(event.startTime)}`,
    `DTEND:${formatIcsDate(event.endTime)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    ...(location ? [`LOCATION:${location}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  const ics = lines.join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `event-${sanitizeFilenamePart(event.title)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
