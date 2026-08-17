import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildBookingIcs,
  escapeIcsText,
  generateGoogleCalendarLink,
  toIcsUtc,
} from '../src/calendar.ts'
import { BookingStatus, BookingType, type Booking } from '../src/bookings.ts'

// 2026-03-14 09:00:00Z -> 10:30:00Z
const START = '1773478800'
const END = '1773484200'

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    bookingId: 'bk-1',
    memberId: 'mem-1',
    registration: 'OH-ABC',
    type: BookingType.PRIVATE,
    status: BookingStatus.CONFIRMED,
    startTimeEpoch: START,
    startTime: '2026-03-14T09:00:00.000Z',
    endTimeEpoch: END,
    endTime: '2026-03-14T10:30:00.000Z',
    calendarSequence: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'someone',
    updatedAt: '2026-03-01T00:00:00.000Z',
    updatedBy: 'someone',
    ...overrides,
  }) as Booking

describe('buildBookingIcs', () => {
  beforeEach(() => {
    // DTSTAMP is `new Date()`, so pin it to keep the exact-output assertions stable.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // The three cases below are the three call shapes that existed before this
  // builder replaced the two hand-written copies (issue #1115, finding 8). They
  // assert the whole payload rather than individual lines, because the point of
  // the refactor was that the bytes did not change — field order included.

  it('builds the mailed invite exactly as the backend used to', () => {
    const ics = buildBookingIcs(booking({ description: 'Local flight' }), {
      method: 'REQUEST',
      organizerEmail: 'noreply@mik.fi',
      attendeeEmail: 'member@example.com',
    })

    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:booking-bk-1@mik.fi',
      'DTSTAMP:20260310T120000Z',
      'DTSTART:20260314T090000Z',
      'DTEND:20260314T103000Z',
      'SUMMARY:MIK - OH-ABC',
      'DESCRIPTION:Local flight',
      'SEQUENCE:0',
      'ORGANIZER:mailto:noreply@mik.fi',
      'ATTENDEE;RSVP=FALSE:mailto:member@example.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
  })

  it('builds the browser download with no organiser or attendee', () => {
    const ics = buildBookingIcs(booking({ description: 'Local flight' }), { method: 'REQUEST' })

    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:booking-bk-1@mik.fi',
      'DTSTAMP:20260310T120000Z',
      'DTSTART:20260314T090000Z',
      'DTEND:20260314T103000Z',
      'SUMMARY:MIK - OH-ABC',
      'DESCRIPTION:Local flight',
      'SEQUENCE:0',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
  })

  it('builds the cancellation with STATUS:CANCELLED and no DESCRIPTION', () => {
    const ics = buildBookingIcs(booking({ description: 'Local flight', calendarSequence: 3 }), {
      method: 'CANCEL',
      organizerEmail: 'noreply@mik.fi',
    })

    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      'UID:booking-bk-1@mik.fi',
      'DTSTAMP:20260310T120000Z',
      'DTSTART:20260314T090000Z',
      'DTEND:20260314T103000Z',
      'SUMMARY:MIK - OH-ABC',
      'SEQUENCE:3',
      'ORGANIZER:mailto:noreply@mik.fi',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
  })

  it('uses CRLF line endings, as RFC 5545 requires', () => {
    const ics = buildBookingIcs(booking(), { method: 'REQUEST' })

    expect(ics).toContain('\r\n')
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('falls back to the booking type when there is no description', () => {
    const ics = buildBookingIcs(booking({ description: undefined }), { method: 'REQUEST' })

    expect(ics).toContain(`DESCRIPTION:${BookingType.PRIVATE}`)
  })

  it('escapes the characters that would otherwise break the VEVENT', () => {
    const ics = buildBookingIcs(
      booking({ description: 'Trip: A, B; C\\D\nsecond line', registration: 'OH-A,B' }),
      { method: 'REQUEST' },
    )

    expect(ics).toContain('DESCRIPTION:Trip: A\\, B\\; C\\\\D\\nsecond line')
    expect(ics).toContain('SUMMARY:MIK - OH-A\\,B')
    // The escaped newline must not become a real one, or the VEVENT is truncated.
    expect(ics.split('\r\n').filter((l) => l.startsWith('DESCRIPTION'))).toHaveLength(1)
  })

  it('defaults a missing calendarSequence to 0 rather than emitting undefined', () => {
    const { calendarSequence: _dropped, ...withoutSequence } = booking()
    const ics = buildBookingIcs(withoutSequence as Booking, { method: 'REQUEST' })

    expect(ics).toContain('SEQUENCE:0')
  })
})

describe('generateGoogleCalendarLink', () => {
  it('encodes the booking into a Google Calendar template URL', () => {
    const url = new URL(generateGoogleCalendarLink(booking({ description: 'Local flight' })))

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('MIK - OH-ABC')
    expect(url.searchParams.get('dates')).toBe('20260314T090000Z/20260314T103000Z')
    expect(url.searchParams.get('details')).toBe('Local flight')
  })

  it('encodes characters that would otherwise split the query string', () => {
    const url = new URL(
      generateGoogleCalendarLink(booking({ description: 'A&B=C', registration: 'OH ABC' })),
    )

    expect(url.searchParams.get('details')).toBe('A&B=C')
    expect(url.searchParams.get('text')).toBe('MIK - OH ABC')
  })
})

// Both helpers are exported rather than module-private because the frontend's
// club-event ICS needs them too, and had its own copies (issue #1115 finding 8).
// Their behaviour is therefore a contract between two callers, not an internal
// detail of buildBookingIcs, so it is asserted directly.
describe('toIcsUtc', () => {
  it('renders a Date as a compact UTC timestamp', () => {
    expect(toIcsUtc(new Date('2026-03-14T09:00:00.000Z'))).toBe('20260314T090000Z')
  })

  it('normalises a non-UTC instant to UTC', () => {
    // Same instant, written with an offset. ICS UTC values must not carry it.
    expect(toIcsUtc(new Date('2026-03-14T11:00:00.000+02:00'))).toBe('20260314T090000Z')
  })

  it('drops sub-second precision rather than rounding it', () => {
    expect(toIcsUtc(new Date('2026-03-14T09:00:00.999Z'))).toBe('20260314T090000Z')
  })
})

describe('escapeIcsText', () => {
  // String.raw throughout: these assertions are about backslashes, and writing
  // them with JS escapes is how the first draft of this test came out asserting
  // `';'` where it meant `'\;'`.
  it.each([
    ['semicolons', 'a;b', String.raw`a\;b`],
    ['commas', 'a,b', String.raw`a\,b`],
    ['newlines', 'a\nb', String.raw`a\nb`],
    ['backslashes', String.raw`a\b`, String.raw`a\\b`],
  ])('escapes %s', (_what, input, expected) => {
    expect(escapeIcsText(input)).toBe(expected)
  })

  it('escapes the backslash before the characters it introduces', () => {
    // Order matters. Escaping `;` first and `\` second would go back over the
    // backslash this function had just inserted and double it.
    expect(escapeIcsText(';')).toBe(String.raw`\;`)
    expect(escapeIcsText(String.raw`\;`)).toBe(String.raw`\\\;`)
  })

  it('leaves ordinary text alone', () => {
    expect(escapeIcsText('MIK - OH-ABC')).toBe('MIK - OH-ABC')
  })
})
