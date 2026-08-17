import type { ClubEvent } from '@mik/contracts/events'
import { escapeIcsText, toIcsUtc } from '@mik/contracts/calendar'

import { sanitizeFilenamePart, saveIcsFile } from './icsDownload'

// Event times are ISO strings, unlike a booking's epoch seconds — which is the
// only thing that ever differed between this file's ICS code and the booking
// builder's. The UTC formatting and the text escaping are shared (issue #1115,
// finding 8); this file previously had its own copies of both.
const eventIcsDate = (iso: string): string => toIcsUtc(new Date(iso))

export const generateEventGoogleCalendarLink = (event: ClubEvent): string => {
  const start = eventIcsDate(event.startTime)
  const end = eventIcsDate(event.endTime)
  const text = encodeURIComponent(`MIK – ${event.title}`)
  const details = encodeURIComponent(event.description ?? '')
  const location = encodeURIComponent(event.location ?? '')
  const dates = encodeURIComponent(`${start}/${end}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`
}

export const downloadEventIcs = (event: ClubEvent): void => {
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
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${eventIcsDate(event.startTime)}`,
    `DTEND:${eventIcsDate(event.endTime)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    ...(location ? [`LOCATION:${location}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  saveIcsFile(lines.join('\r\n'), `event-${sanitizeFilenamePart(event.title)}.ics`)
}
