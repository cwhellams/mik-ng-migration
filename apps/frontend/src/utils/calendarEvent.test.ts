import { beforeEach, describe, expect, it, vi } from 'vitest'

import { aBooking } from '../test/fixtures'
import { downloadIcs } from './calendarEvent'

/**
 * The VCALENDAR body is `buildBookingIcs`, covered in
 * `packages/contracts/test/calendar.test.ts`. What is only true here is the
 * wiring: this is the member saving their own booking, so it asks for REQUEST and
 * passes no organiser, and the filename comes from the registration.
 */
describe('downloadIcs', () => {
  let anchors: HTMLAnchorElement[]
  let blobs: Blob[]

  beforeEach(() => {
    anchors = []
    blobs = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = createElement(tag)
      if (tag === 'a') anchors.push(element as HTMLAnchorElement)
      return element
    })
    // jsdom would otherwise log "Not implemented: navigation" for the synthetic click.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('offers a REQUEST invite with no organiser', async () => {
    downloadIcs(aBooking())

    const ics = await blobs[0].text()
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('UID:booking-stl1@mik.fi')
    // A member-saved file must not claim to be sent on the club's behalf.
    expect(ics).not.toContain('ORGANIZER')
    expect(ics).not.toContain('ATTENDEE')
  })

  it('names the file after the registration', () => {
    downloadIcs(aBooking())

    expect(anchors[0].download).toBe('booking-OH-STL.ics')
  })

  it('replaces characters that are unsafe in a filename', () => {
    downloadIcs(aBooking({ registration: 'OH/STL 2' }))

    expect(anchors[0].download).toBe('booking-OH_STL_2.ics')
  })
})
