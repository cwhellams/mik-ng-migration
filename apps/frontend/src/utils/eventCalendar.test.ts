import type { ClubEvent } from '@mik/contracts/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadEventIcs, generateEventGoogleCalendarLink } from './eventCalendar'

/**
 * Pins the club-event ICS. This file had no test at all while it carried its own
 * copies of the booking builder's `formatIcsDate` and `escapeIcsText` (issue #1115
 * finding 8), so nothing would have caught the two drifting apart — which is the
 * whole risk that finding describes. The helpers are shared now; these assertions
 * are what make a future divergence fail.
 */

const anEvent = (overrides: Partial<ClubEvent> = {}): ClubEvent =>
  ({
    eventId: 'ev-1',
    title: 'Spring fly-in',
    description: 'Bring your own coffee',
    location: 'EFHF',
    startTime: '2026-03-14T09:00:00.000Z',
    endTime: '2026-03-14T10:30:00.000Z',
    ...overrides,
  }) as ClubEvent

describe('generateEventGoogleCalendarLink', () => {
  it('builds a template link with UTC compact timestamps', () => {
    const link = generateEventGoogleCalendarLink(anEvent())

    expect(link).toContain('dates=20260314T090000Z%2F20260314T103000Z')
    expect(link).toContain(`text=${encodeURIComponent('MIK – Spring fly-in')}`)
    expect(link).toContain('location=EFHF')
  })

  it('sends empty details and location when the event has neither', () => {
    const link = generateEventGoogleCalendarLink(
      anEvent({ description: null, location: null } as Partial<ClubEvent>),
    )

    expect(link).toContain('details=&')
    expect(link).toMatch(/location=$/)
  })
})

describe('downloadEventIcs', () => {
  let anchors: HTMLAnchorElement[]
  let blobs: Blob[]
  let created: string[]
  let revoked: string[]

  beforeEach(() => {
    // DTSTAMP reads the clock, so pin it for exact-output assertions.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'))

    anchors = []
    blobs = []
    created = []
    revoked = []
    // Recording the anchor as it is created, rather than reading `this` inside a
    // stubbed click, keeps the assertion about the element the code built.
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = createElement(tag)
      if (tag === 'a') anchors.push(element as HTMLAnchorElement)
      return element
    })
    // The real Blob is kept — reading it back with .text() is what proves what the
    // user would actually receive. Only the object-URL plumbing is stubbed, since
    // jsdom has no implementation of it.
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      const url = `blob:mock-${created.length}`
      created.push(url)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url)
    })
    // jsdom would otherwise log "Not implemented: navigation" for the synthetic click.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** The ICS text the download would have handed the user. */
  const icsFor = async (event: ClubEvent): Promise<string> => {
    downloadEventIcs(event)
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('text/calendar')
    return await blobs[0].text()
  }

  it('emits a PUBLISH VEVENT with escaped text and UTC times', async () => {
    const ics = await icsFor(anEvent({ title: 'Fly-in; bring, food', description: 'Line\nTwo' }))

    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Malmin Ilmailukerho//MIK-NG//EN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:event-ev-1@mik.fi',
      'DTSTAMP:20260310T120000Z',
      'DTSTART:20260314T090000Z',
      'DTEND:20260314T103000Z',
      // The escaping is the shared helper's: ; and , backslash-escaped, \n literalised.
      'SUMMARY:MIK – Fly-in\\; bring\\, food',
      'DESCRIPTION:Line\\nTwo',
      'LOCATION:EFHF',
      'END:VEVENT',
      'END:VCALENDAR',
    ])
  })

  it('omits LOCATION entirely when the event has none', async () => {
    const ics = await icsFor(anEvent({ location: null } as Partial<ClubEvent>))

    expect(ics).not.toContain('LOCATION:')
  })

  it('names the file after the event, with unsafe characters replaced', async () => {
    await icsFor(anEvent({ title: 'Fly-in @ EFHF / 2026' }))

    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('event-Fly-in___EFHF___2026.ics')
  })

  it('revokes the object URL it created', async () => {
    await icsFor(anEvent())

    expect(created).toHaveLength(1)
    expect(revoked).toEqual(created)
  })
})
